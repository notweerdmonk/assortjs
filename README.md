# assortjs

**Runtime Type Checker for JavaScript**


A small schema-based runtime validator for JavaScript ES modules. Define schemas
with `v`, then validate values with `parse`, `safeParse`, or `matches`.

This module checks values at runtime. It does not infer TypeScript types from
schemas; the validation functions return `unknown` unless you add your own
type assertions or declarations.

## Requirements

- Node.js 20 or later
- ECMAScript module support

## Installation

For local development, clone or copy this repository and import the module:

```js
import { v, parse } from "./type-checker.mjs";
```

When published as an npm package, install it with:

```sh
npm install runtime-type-checker
```

Then import it:

```js
import { v, parse } from "runtime-type-checker";
```

## Quick start

```js
import { v, safeParse } from "./type-checker.mjs";

const userSchema = v.object({
  id: v.number({ integer: true, min: 1 }),
  name: v.string(),
  email: v.optional(v.string()),
});

const result = safeParse(userSchema, {
  id: 1,
  name: "Ada",
});

if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error.message);
}
```

Object schemas default to strict unknown-key handling. An unexpected property
causes validation to fail.

## API

### Schema constructors

- `v.any()` and `v.unknown()` accept any value.
- `v.never()` rejects every value.
- `v.string()`, `v.boolean()`, `v.bigint()`, `v.symbol()`,
  `v.undefined()`, and `v.null()` check primitive values.
- `v.number(options)` accepts numbers. Options:
  - `finite`: require a finite number.
  - `integer`: require an integer.
  - `safeInteger`: require a safe integer.
  - `min`, `max`: inclusive numeric bounds.
- `v.literal(value)` checks equality using `Object.is`.
- `v.array(item, options)` validates array elements. Options `min` and `max`
  constrain the array length. Sparse arrays are rejected.
- `v.tuple(items)` validates an array with exactly the supplied schemas and
  length. Sparse arrays are rejected.
- `v.object(shape, options)` validates a plain object against a property
  schema. `unknownKeys` can be:
  - `"strict"` (default): reject extra enumerable own properties.
  - `"strip"`: omit extra properties from the parsed result.
  - `"passthrough"`: copy extra properties into the parsed result.
- `v.record(valueSchema)` validates a plain object’s enumerable string-keyed
  values.
- `v.optional(inner)` accepts `undefined` or a value matching `inner`.
- `v.nullable(inner)` accepts `null` or a value matching `inner`.
- `v.union(schemas)` accepts a value matching at least one schema.
- `v.instanceOf(constructor)` checks `value instanceof constructor`.
- `v.exactPrototype(prototype)` checks for an exact prototype match.
- `v.custom(predicate, description)` validates with a predicate function.
  A thrown predicate is treated as a validation failure.
- `v.lazy(getter)` defers schema creation, useful for recursive schemas.

### Validation functions

- `safeParse(schema, value, options?)` returns either
  `{ success: true, data }` or `{ success: false, error }`. It does not throw
  for ordinary validation failures.
- `parse(schema, value, options?)` returns the parsed value or throws a
  `ValidationError`.
- `matches(schema, value)` returns a boolean.
- `ValidationError` extends `TypeError`. Its `issues` property contains
  structured validation issues with `path`, `expected`, and `received` fields.

The optional `maxDepth` validation option limits recursive schema traversal.
It defaults to `100`.

## Examples

### Constrained values

```js
const quantity = v.number({
  integer: true,
  min: 1,
  max: 99,
});

parse(quantity, 5); // 5
parse(quantity, 1.5); // throws ValidationError
```

### Unknown object keys

```js
const strictSchema = v.object({ name: v.string() });
const stripSchema = v.object(
  { name: v.string() },
  { unknownKeys: "strip" }
);
const passthroughSchema = v.object(
  { name: v.string() },
  { unknownKeys: "passthrough" }
);
```

### Recursive schemas

```js
const nodeSchema = v.lazy(() =>
  v.object({
    value: v.string(),
    children: v.array(nodeSchema),
  })
);

parse(nodeSchema, {
  value: "root",
  children: [{ value: "child", children: [] }],
});
```

### Error handling

```js
try {
  parse(v.object({ age: v.number() }), { age: "old" });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(error.issues);
  }
}
```

## Testing

Run the test suite using `npx`:

```sh
npx --yes mocha --reporter spec
```

Or use Node’s built-in test runner directly:

```sh
npm test
```

## License

MIT. See [LICENSE](./LICENSE).
