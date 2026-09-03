import { describe, expect, it } from "vitest"

import { createPlaywrightLanguageModel, PlaywrightProviderAccessError } from "./playwright-provider"

describe("Playwright provider gate", () => {
  it("is unreachable when the explicit test gate is absent", () => {
    // Given: an ordinary production environment without the Playwright gate.
    const environment: NodeJS.ProcessEnv = { NODE_ENV: "production" }

    // When: the test provider boundary is invoked directly.
    const create = () => createPlaywrightLanguageModel(environment)

    // Then: access fails before a model can be returned.
    expect(create).toThrow(PlaywrightProviderAccessError)
  })

  it("creates the deterministic model only for the exact enabled gate", () => {
    // Given: the production E2E server's explicit gate.
    const environment: NodeJS.ProcessEnv = { NODE_ENV: "production", PLAYWRIGHT_TEST: "1" }

    // When: the provider boundary creates its model.
    const model = createPlaywrightLanguageModel(environment)

    // Then: the machine-facing provider identity proves the gated branch was selected.
    expect(model.provider).toBe("playwright")
    expect(model.modelId).toBe("task13")
  })
})
