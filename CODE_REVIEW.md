# Code review checklist (resolved)

This document tracked improvements from an internal review. **All actionable items below are implemented** in the current codebase.

## High priority — done

| Item | Resolution |
|------|------------|
| **1. `isPlainObject` duplication** | Centralized in `src/utils.ts` (`isPlainObject`, `toLabel`, `truncate`). |
| **2. Custom error types** | `src/errors.ts`: `JSONExtractionError`, `ProviderError`, `QueryRetriesExhaustedError`. Exported from `src/index.ts`. |
| **3. Magic numbers** | `src/constants.ts` (`LOG_PREFIX`, truncation limits, etc.). |
| **4. Global `/g` fence regex** | `createFenceRegex()` returns a **new** `RegExp` per `parseFirstMatchingFence` call (no shared `lastIndex`). |

## Medium priority — done

| Item | Resolution |
|------|------------|
| **5. Validation error repetition** | `issue()` factory in `src/validator.ts` builds `ValidationError` with `toLabel` for `received`. |
| **6. Input validation** | Guards on `coerce`, `validate`, and provider factories (`TypeError` with `[llm-schema-validator]` prefix). |
| **7. Consistent error strings** | User-facing strings prefixed with `[llm-schema-validator]` where appropriate; thrown errors use `LOG_PREFIX` / sub-prefixes in `errors.ts`. |
| **8. Logging abstraction** | `QueryLogger` + optional `logger` on `QueryOptions`; diagnostics use `logger.debug` when set, else `console.log` when `debug` is true. |
| **9. Provider error handling** | `createOpenAIProvider` / `createAnthropicProvider` wrap SDK calls; `APIError` → `ProviderError` with `cause`. |

## Low priority — done

| Item | Resolution |
|------|------------|
| **10. `collectBalancedCandidates` repeated work** | Balanced segments computed **once** per `extractJSON` call and reused across strategies. |
| **11. JSDoc on internals** | Added/expanded on `describeField`, `validateTypeAndNested`, `describeSchemaShape`. |
| **12. `satisfies` on parser strategies** | `strategies` uses `as const satisfies ReadonlyArray<{ name: string; run: () => unknown }>`. |
| **13. `package.json`** | `sideEffects: false`, `funding`, `author`, repository URLs; `lint` / `format` scripts. |
| **14. `.editorconfig`** | Added (UTF-8, LF, 2-space indent). |
| **15. ESLint + Prettier** | `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`; `npm run lint` / `npm run format`. |

## Maintenance

- Run **`npm run lint`**, **`npm test`**, and **`npm run build`** before releases.
- Optional: run **`npm run format`** before committing.

## Note on `SchemaValidationError`

Validation returns `ValidationError[]` (not thrown) by design. A dedicated **thrown** `SchemaValidationError` class was not added to avoid duplicating that model; structured failures use `QueryRetriesExhaustedError` + `QueryResult.errors`.
