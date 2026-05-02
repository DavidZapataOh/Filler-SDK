# FillerBond
[Git Source](https://github.com/DavidZapataOh/Filler-SDK/blob/07111f359f7a23a885d8effd4d4587ef08fd3a46/src/FillerBond.sol)

**Inherits:**
Ownable

**Title:**
FillerBond — Stake + slash bond contract for filler accountability

**Author:**
Filler SDK Contributors

Stakers deposit ETH as bond for a specific filler. If the filler commits a
slashable violation (observable via Reactor event), the owner can slash by
submitting evidence. Stakers can withdraw after a 7-day cooldown.

IMMUTABLE — no upgradeability. v0 trust assumption: owner-controlled slash with
evidence hash. See `docs/adr/0002-bond-v0-owner-slash.md` for the trust model
and v1 trustless-slash roadmap.


## State Variables
### REACTOR
The canonical UniswapX Reactor whose events are valid evidence.

Stored for off-chain SDK convenience and v1 trustless-slash upgrade path;
v0 does not verify evidence on-chain.


```solidity
address public immutable REACTOR
```


### UNSTAKE_COOLDOWN
The cooldown period before staked funds can be withdrawn.


```solidity
uint256 public constant UNSTAKE_COOLDOWN = 7 days
```


### treasury
Treasury address that receives slashed funds. MUST be a multisig (verified at deploy
time).


```solidity
address public treasury
```


### stakes

```solidity
mapping(address filler => mapping(address staker => StakeInfo)) public stakes
```


### totalStakedFor
Total active stake per filler (does NOT include amounts in cooldown).


```solidity
mapping(address filler => uint256) public totalStakedFor
```


### totalStaked
Total active stake across all fillers (does NOT include amounts in cooldown).


```solidity
uint256 public totalStaked
```


### totalSlashed
Lifetime slashed amount.


```solidity
uint256 public totalSlashed
```


### totalEverStaked
Lifetime staked amount (for invariant checks).


```solidity
uint256 public totalEverStaked
```


### slashedEvidence
Track slashed evidence hashes to prevent double-slash.


```solidity
mapping(bytes32 evidenceHash => bool slashed) public slashedEvidence
```


### locked
Transient reentrancy guard (Solidity 0.8.28+ transient storage).


```solidity
bool transient locked
```


## Functions
### nonReentrant

Reset within the same tx so subsequent external calls can re-enter the contract
through a different nonReentrant function. Transient storage clears between txs
automatically — this reset only matters for sequential calls in one tx.


```solidity
modifier nonReentrant() ;
```

### _enterReentrancyGuard


```solidity
function _enterReentrancyGuard() internal;
```

### _exitReentrancyGuard


```solidity
function _exitReentrancyGuard() internal;
```

### constructor


```solidity
constructor(
    address _treasury,
    address _reactor
) ;
```

### stake

Stake ETH as bond for a specific filler address.


```solidity
function stake(
    address filler
) external payable nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`filler`|`address`|The filler contract this stake is bonded to.|


### requestUnstake

Step 1: Request to unstake. Starts the 7-day cooldown.

Active stake is reduced immediately so a slash that lands during cooldown
cannot consume already-requested funds. v0 trade-off: stakers can race a
slash by front-running with `requestUnstake`. v1 (virtual shares) closes this.
Defensive cap: a slash decrements `totalStakedFor[filler]` without touching
individual `stakes[filler][staker].amount`. Without this guard, a staker who
attempts to unstake more than the post-slash pool size would underflow on
`totalStakedFor[filler] -= amount` and revert with a generic `Panic(0x11)`.
Capping by `totalStakedFor` makes that case revert cleanly with `NotEnoughStake`.
v1 (virtual shares) eliminates the divergence entirely.


```solidity
function requestUnstake(
    address filler,
    uint256 amount
) external nonReentrant;
```

### withdraw

Step 2: Withdraw after cooldown elapsed.


```solidity
function withdraw(
    address filler
) external nonReentrant;
```

### slash

Slash a filler's stake by submitting evidence of a violation.

v0: owner-only with evidence hash, no on-chain verification of the hash.
v1 roadmap: trustless slash via Reactor event proof + receipts-trie inclusion.


```solidity
function slash(
    address filler,
    uint256 amount,
    bytes32 evidenceHash
) external onlyOwner nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`filler`|`address`|The filler whose active stake is being slashed.|
|`amount`|`uint256`|The amount to slash, capped at active stake (does not touch cooldown).|
|`evidenceHash`|`bytes32`|An off-chain commitment to the violation (Reactor log hash, etc.).|


### stakeOf


```solidity
function stakeOf(
    address filler,
    address staker
) external view returns (uint256);
```

### pendingWithdrawal


```solidity
function pendingWithdrawal(
    address filler,
    address staker
) external view returns (uint256 amount, uint256 availableAt);
```

### setTreasury

Update treasury address. MUST be a multisig.


```solidity
function setTreasury(
    address newTreasury
) external onlyOwner;
```

### receive

Reject direct ETH transfers — must use `stake()`.


```solidity
receive() external payable;
```

## Events
### Staked

```solidity
event Staked(address indexed filler, address indexed staker, uint256 amount);
```

### UnstakeRequested

```solidity
event UnstakeRequested(
    address indexed filler, address indexed staker, uint256 amount, uint256 cooldownEnd
);
```

### Withdrawn

```solidity
event Withdrawn(address indexed filler, address indexed staker, uint256 amount);
```

### Slashed

```solidity
event Slashed(
    address indexed filler,
    address indexed slasher,
    uint256 amount,
    bytes32 indexed evidenceHash
);
```

### TreasuryUpdated

```solidity
event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
```

## Structs
### StakeInfo
Per-staker stake info per filler.


```solidity
struct StakeInfo {
    uint256 amount; // Currently active stake (slashable)
    uint256 unstakeRequestTime; // 0 if no pending request
    uint256 unstakeAmount; // Amount in cooldown awaiting withdrawal
}
```

