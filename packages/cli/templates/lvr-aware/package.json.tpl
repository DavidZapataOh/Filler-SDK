{
  "name": "{{projectName}}",
  "version": "0.0.1",
  "description": "LVR-Aware Filler — UniswapX vertical solver on {{chain}}",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "start": "bun src/filler.ts",
    "dev": "bun --hot src/filler.ts",
    "stake": "bun src/stake.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@filler-sdk/sdk": "^0.0.0",
    "viem": "^2.21.0",
    "zod": "^4.4.1",
    "prom-client": "^15.1.3"
  },
  "devDependencies": {
    "@types/node": "^25.0.0",
    "typescript": "^5.6.0",
    "vitest": "^4.1.5"
  },
  "engines": {
    "node": ">=20"
  }
}
