{
  "name": "{{projectName}}",
  "version": "0.0.0",
  "description": "Filler SDK solver — {{vertical}} vertical on {{chain}}",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "start": "bun src/index.ts",
    "dev": "bun --hot src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@filler-sdk/sdk": "^0.0.0",
    "viem": "^2.21.0"
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
