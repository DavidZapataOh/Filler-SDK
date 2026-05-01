// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "solady/auth/Ownable.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

import {
    NotEnoughStake,
    CooldownNotElapsed,
    NoUnstakeRequest,
    AlreadySlashed,
    ZeroStake,
    Reentrancy,
    InvalidAddress,
    DirectETHRejected
} from "./errors/Errors.sol";

/// @title FillerBond — Stake + slash bond contract for filler accountability
/// @author Filler SDK Contributors
/// @notice Stakers deposit ETH as bond for a specific filler. If the filler commits a
///         slashable violation (observable via Reactor event), the owner can slash by
///         submitting evidence. Stakers can withdraw after a 7-day cooldown.
/// @dev IMMUTABLE — no upgradeability. v0 trust assumption: owner-controlled slash with
///      evidence hash. See `docs/adr/0002-bond-v0-owner-slash.md` for the trust model
///      and v1 trustless-slash roadmap.
contract FillerBond is Ownable {
    // ============ Immutable state ============

    /// @notice The canonical UniswapX Reactor whose events are valid evidence.
    /// @dev Stored for off-chain SDK convenience and v1 trustless-slash upgrade path;
    ///      v0 does not verify evidence on-chain.
    address public immutable REACTOR;

    /// @notice The cooldown period before staked funds can be withdrawn.
    uint256 public constant UNSTAKE_COOLDOWN = 7 days;

    // ============ Mutable state ============

    /// @notice Treasury address that receives slashed funds. MUST be a multisig (verified at deploy
    /// time).
    address public treasury;

    /// @notice Per-staker stake info per filler.
    struct StakeInfo {
        uint256 amount; // Currently active stake (slashable)
        uint256 unstakeRequestTime; // 0 if no pending request
        uint256 unstakeAmount; // Amount in cooldown awaiting withdrawal
    }

    mapping(address filler => mapping(address staker => StakeInfo)) public stakes;

    /// @notice Total active stake per filler (does NOT include amounts in cooldown).
    mapping(address filler => uint256) public totalStakedFor;

    /// @notice Total active stake across all fillers (does NOT include amounts in cooldown).
    uint256 public totalStaked;

    /// @notice Lifetime slashed amount.
    uint256 public totalSlashed;

    /// @notice Lifetime staked amount (for invariant checks).
    uint256 public totalEverStaked;

    /// @notice Track slashed evidence hashes to prevent double-slash.
    mapping(bytes32 evidenceHash => bool slashed) public slashedEvidence;

    /// @notice Transient reentrancy guard (Solidity 0.8.28+ transient storage).
    bool transient locked;

    // ============ Events ============

    event Staked(address indexed filler, address indexed staker, uint256 amount);
    event UnstakeRequested(
        address indexed filler, address indexed staker, uint256 amount, uint256 cooldownEnd
    );
    event Withdrawn(address indexed filler, address indexed staker, uint256 amount);
    event Slashed(
        address indexed filler,
        address indexed slasher,
        uint256 amount,
        bytes32 indexed evidenceHash
    );
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    // ============ Modifiers ============

    /// @dev Reset within the same tx so subsequent external calls can re-enter the contract
    ///      through a different nonReentrant function. Transient storage clears between txs
    ///      automatically — this reset only matters for sequential calls in one tx.
    modifier nonReentrant() {
        _enterReentrancyGuard();
        _;
        _exitReentrancyGuard();
    }

    function _enterReentrancyGuard() internal {
        if (locked) revert Reentrancy();
        locked = true;
    }

    function _exitReentrancyGuard() internal {
        locked = false;
    }

    // ============ Constructor ============

    constructor(
        address _treasury,
        address _reactor
    ) {
        if (_treasury == address(0) || _reactor == address(0)) revert InvalidAddress();
        treasury = _treasury;
        REACTOR = _reactor;
        _initializeOwner(msg.sender);
        emit TreasuryUpdated(address(0), _treasury);
    }

    // ============ Stake ============

    /// @notice Stake ETH as bond for a specific filler address.
    /// @param filler The filler contract this stake is bonded to.
    function stake(
        address filler
    ) external payable nonReentrant {
        if (msg.value == 0) revert ZeroStake();
        if (filler == address(0)) revert InvalidAddress();

        StakeInfo storage info = stakes[filler][msg.sender];
        info.amount += msg.value;

        totalStakedFor[filler] += msg.value;
        totalStaked += msg.value;
        totalEverStaked += msg.value;

        emit Staked(filler, msg.sender, msg.value);
    }

    // ============ Withdraw (2-step) ============

    /// @notice Step 1: Request to unstake. Starts the 7-day cooldown.
    /// @dev Active stake is reduced immediately so a slash that lands during cooldown
    ///      cannot consume already-requested funds. v0 trade-off: stakers can race a
    ///      slash by front-running with `requestUnstake`. v1 (virtual shares) closes this.
    ///
    ///      Defensive cap: a slash decrements `totalStakedFor[filler]` without touching
    ///      individual `stakes[filler][staker].amount`. Without this guard, a staker who
    ///      attempts to unstake more than the post-slash pool size would underflow on
    ///      `totalStakedFor[filler] -= amount` and revert with a generic `Panic(0x11)`.
    ///      Capping by `totalStakedFor` makes that case revert cleanly with `NotEnoughStake`.
    ///      v1 (virtual shares) eliminates the divergence entirely.
    function requestUnstake(
        address filler,
        uint256 amount
    ) external nonReentrant {
        StakeInfo storage info = stakes[filler][msg.sender];
        if (amount == 0 || info.amount < amount) revert NotEnoughStake();
        if (amount > totalStakedFor[filler]) revert NotEnoughStake();

        info.amount -= amount;
        info.unstakeAmount += amount;
        info.unstakeRequestTime = block.timestamp;

        totalStakedFor[filler] -= amount;
        totalStaked -= amount;

        emit UnstakeRequested(filler, msg.sender, amount, block.timestamp + UNSTAKE_COOLDOWN);
    }

    /// @notice Step 2: Withdraw after cooldown elapsed.
    function withdraw(
        address filler
    ) external nonReentrant {
        StakeInfo storage info = stakes[filler][msg.sender];
        if (info.unstakeRequestTime == 0) revert NoUnstakeRequest();
        if (block.timestamp < info.unstakeRequestTime + UNSTAKE_COOLDOWN) {
            revert CooldownNotElapsed();
        }

        uint256 amount = info.unstakeAmount;
        info.unstakeAmount = 0;
        info.unstakeRequestTime = 0;

        emit Withdrawn(filler, msg.sender, amount);

        // CEI: interaction last.
        SafeTransferLib.safeTransferETH(msg.sender, amount);
    }

    // ============ Slash ============

    /// @notice Slash a filler's stake by submitting evidence of a violation.
    /// @dev v0: owner-only with evidence hash, no on-chain verification of the hash.
    ///      v1 roadmap: trustless slash via Reactor event proof + receipts-trie inclusion.
    /// @param filler The filler whose active stake is being slashed.
    /// @param amount The amount to slash, capped at active stake (does not touch cooldown).
    /// @param evidenceHash An off-chain commitment to the violation (Reactor log hash, etc.).
    function slash(
        address filler,
        uint256 amount,
        bytes32 evidenceHash
    ) external onlyOwner nonReentrant {
        if (slashedEvidence[evidenceHash]) revert AlreadySlashed();
        if (amount == 0) revert ZeroStake();
        if (amount > totalStakedFor[filler]) revert NotEnoughStake();

        slashedEvidence[evidenceHash] = true;

        // v0: simplified pool-level slashing. Individual `stakes[filler][*].amount`
        // are NOT decremented here — accounting drift is bounded by `totalStakedFor[filler]`,
        // and `requestUnstake` underflow guards prevent over-withdrawal.
        // v1 will use checkpointed virtual shares for clean per-staker pro-rata.
        totalStakedFor[filler] -= amount;
        totalStaked -= amount;
        totalSlashed += amount;

        emit Slashed(filler, msg.sender, amount, evidenceHash);

        // CEI: interaction last.
        SafeTransferLib.safeTransferETH(treasury, amount);
    }

    // ============ View ============

    function stakeOf(
        address filler,
        address staker
    ) external view returns (uint256) {
        return stakes[filler][staker].amount;
    }

    function pendingWithdrawal(
        address filler,
        address staker
    ) external view returns (uint256 amount, uint256 availableAt) {
        StakeInfo storage info = stakes[filler][staker];
        amount = info.unstakeAmount;
        availableAt = info.unstakeRequestTime == 0
            ? type(uint256).max
            : info.unstakeRequestTime + UNSTAKE_COOLDOWN;
    }

    // ============ Admin ============

    /// @notice Update treasury address. MUST be a multisig.
    function setTreasury(
        address newTreasury
    ) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    // ============ Fallback ============

    /// @notice Reject direct ETH transfers — must use `stake()`.
    receive() external payable {
        revert DirectETHRejected();
    }
}
