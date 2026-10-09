/*
 * MIT License
 * 
 * Copyright (c) 2026 notweerdmonk, gpt-6-luna
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Private runtime brand used to recognize schemas created by this module.
 */
const BRAND = Symbol("schema");

/**
 * Internal sentinel that distinguishes validation failure from valid values
 * such as `undefined`.
 */
const INVALID = Symbol("invalid");

/**
 * @typedef {Object<string, *>} Schema
 */

/**
 * @typedef {Object} ValidationIssue
 * @property {string} path
 * @property {string} expected
 * @property {string} received
 */

/**
 * @typedef {Object} NumberOptions
 * @property {boolean} [finite]
 * @property {boolean} [integer]
 * @property {boolean} [safeInteger]
 * @property {number} [min]
 * @property {number} [max]
 */

/**
 * @typedef {Object} ArrayOptions
 * @property {number} [min]
 * @property {number} [max]
 */

/**
 * @typedef {Object} ObjectOptions
 * @property {"strict" | "strip" | "passthrough"} [unknownKeys]
 */

/**
 * @typedef {Object} ParseOptions
 * @property {number} [maxDepth]
 */

/**
 * Creates an immutable schema descriptor.
 *
 * @param {string} kind
 * @param {Record<string, unknown>} [options]
 * @returns {Schema}
 */
function makeSchema(kind, options = {}) {
  return /** @type {Schema} */ (
    Object.freeze({ [BRAND]: true, kind, ...options })
  );
}

/**
 * Tests whether a value carries this module's private schema brand.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isSchema(value) {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return false;
  }

  return /** @type {any} */ (value)[BRAND] === true;
}

/**
 * Returns true for ordinary objects and null-prototype objects, but not arrays
 * or class instances.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Defines an enumerable own data property. Using `defineProperty` avoids
 * special behavior for keys such as `"__proto__"`.
 *
 * @param {object} target
 * @param {PropertyKey} key
 * @param {unknown} value
 */
function defineValue(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

/**
 * Schema-construction API. Each constructor returns an immutable descriptor;
 * validation is performed later by `parse`, `safeParse`, or `matches`.
 */
const v = Object.freeze({
  /** Accepts any value. */
  any: () => makeSchema("any"),

  /** Accepts any value, like `any`, but communicates intent in the schema. */
  unknown: () => makeSchema("unknown"),

  /** Rejects every value. */
  never: () => makeSchema("never"),

  /** Accepts strings. */
  string: () => makeSchema("string"),

  /** Accepts booleans. */
  boolean: () => makeSchema("boolean"),

  /** Accepts bigints. */
  bigint: () => makeSchema("bigint"),

  /** Accepts symbols. */
  symbol: () => makeSchema("symbol"),

  /** Accepts `undefined`. */
  undefined: () => makeSchema("undefined"),

  /** Accepts `null`. */
  null: () => makeSchema("null"),

  /**
   * Accepts numbers, optionally constrained by finiteness, integer-ness,
   * and inclusive minimum and maximum values.
   *
   * @param {NumberOptions} [options]
   * @returns {Schema}
   */
  number: (options = {}) => makeSchema("number", {
    finite: options.finite ?? false,
    integer: options.integer ?? false,
    safeInteger: options.safeInteger ?? false,
    min: options.min ?? -Infinity,
    max: options.max ?? Infinity,
  }),

  /**
   * Accepts a value that is `Object.is`-equal to the supplied value.
   *
   * @param {unknown} value
   */
  literal: value => makeSchema("literal", { value }),

  /**
   * Accepts an array whose elements match `item`.
   *
   * @param {Schema} item
   * @param {ArrayOptions} [options]
   * @returns {Schema}
   */
  array: (item, options = {}) => {
    if (!isSchema(item)) {
      throw new TypeError("array() expects a schema");
    }
  
    return makeSchema("array", {
      item,
      min: options.min ?? 0,
      max: options.max ?? Infinity,
    });
  },

  /**
   * Accepts an array with exactly one position per supplied schema.
   *
   * @param {Schema[]} items
   */
  tuple: items => {
    if (!Array.isArray(items) || !items.every(isSchema)) {
      throw new TypeError("tuple() expects an array of schemas");
    }
    return makeSchema("tuple", { items: Object.freeze([...items]) });
  },

  /**
   * Accepts a plain object with the given property schemas.
   *
   * @param {object} shape
   * @param {ObjectOptions} [options]
   * @returns {Schema}
   */
  object: (shape, options = {}) => {
    if (shape === null || typeof shape !== "object") {
      throw new TypeError("object() expects a shape object");
    }
  
    const shapeValues =
      /** @type {Record<PropertyKey, unknown>} */ (shape);
  
    const entries = Reflect.ownKeys(shape).map(key => {
      const schema = shapeValues[key];
  
      if (!isSchema(schema)) {
        throw new TypeError(
          `Object property ${String(key)} is not a schema`
        );
      }
  
      return [key, schema];
    });
  
    const unknownKeys = options.unknownKeys ?? "strict";
  
    if (!["strict", "strip", "passthrough"].includes(unknownKeys)) {
      throw new TypeError(
        "unknownKeys must be strict, strip, or passthrough"
      );
    }
  
    return makeSchema("object", {
      entries: Object.freeze(
        entries.map(entry => Object.freeze(entry))
      ),
      unknownKeys,
    });
  },

  /**
   * Accepts a plain object whose enumerable string-keyed values match
   * `valueSchema`.
   *
   * @param {Schema} valueSchema
   */
  record: valueSchema => {
    if (!isSchema(valueSchema)) {
      throw new TypeError("record() expects a value schema");
    }
    return makeSchema("record", { valueSchema });
  },

  /**
   * Accepts `undefined` or a value matching `inner`.
   *
   * @param {Schema} inner
   */
  optional: inner => {
    if (!isSchema(inner)) throw new TypeError("optional() expects a schema");
    return makeSchema("optional", { inner });
  },

  /**
   * Accepts `null` or a value matching `inner`.
   *
   * @param {Schema} inner
   */
  nullable: inner => {
    if (!isSchema(inner)) throw new TypeError("nullable() expects a schema");
    return makeSchema("nullable", { inner });
  },

  /**
   * Accepts a value matching at least one schema in the non-empty list.
   *
   * @param {Schema[]} schemas
   */
  union: schemas => {
    if (!Array.isArray(schemas) || schemas.length === 0 ||
        !schemas.every(isSchema)) {
      throw new TypeError("union() expects a non-empty array of schemas");
    }
    return makeSchema("union", { schemas: Object.freeze([...schemas]) });
  },

  /**
   * Accepts values for which `value instanceof constructor` is true.
   *
   * @param {Function} constructor
   */
  instanceOf: constructor => {
    if (typeof constructor !== "function") {
      throw new TypeError("instanceOf() expects a constructor");
    }
    return makeSchema("instanceOf", { constructor });
  },

  /**
   * Accepts objects or functions whose prototype is exactly `prototype`.
   *
   * @param {object} prototype
   */
  exactPrototype: prototype => {
    if (prototype === null || typeof prototype !== "object") {
      throw new TypeError("exactPrototype() expects a prototype object");
    }
    return makeSchema("exactPrototype", { prototype });
  },

  /**
   * Accepts values for which `check` returns true. If the predicate throws,
   * validation fails with the supplied description.
   *
   * @param {Function} check
   * @param {string} [description]
   * @returns {Schema}
   */
  custom: (check, description = "custom value") => {
    if (typeof check !== "function") {
      throw new TypeError("custom() expects a predicate function");
    }
    return makeSchema("custom", { check, description });
  },

  /**
   * Defers schema construction until validation, which allows recursive
   * schemas to refer to themselves.
   *
   * @param {Function} getter
   * @returns {Schema}
   */
  lazy: getter => {
    if (typeof getter !== "function") {
      throw new TypeError("lazy() expects a function");
    }
    return makeSchema("lazy", { getter });
  },
});

/**
 * Produces a concise JavaScript type label for validation errors.
 *
 * @param {unknown} value
 */
function receivedType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  return typeof value;
}

/**
 * Formats a property/index path for human-readable validation errors.
 *
 * @param {PropertyKey[]} path
 */
function pathText(path) {
  if (path.length === 0) return "<root>";
  return path.map(part =>
    typeof part === "number" ? `[${part}]` : `[${String(part)}]`
  ).join("");
}

/**
 * Adds a validation issue and returns the internal failure sentinel.
 *
 * @param {ValidationIssue[]} issues
 * @param {PropertyKey[]} path
 * @param {string} expected
 * @param {unknown} value
 */
function issue(issues, path, expected, value) {
  issues.push({
    path: pathText(path),
    expected,
    received: receivedType(value),
  });
  return INVALID;
}

/**
 * Validates a value against a schema and returns either the parsed value or
 * the private failure sentinel. Composite schemas build fresh arrays/objects.
 *
 * @param {Schema} schema Schema descriptor to validate against.
 * @param {unknown} value Value to validate.
 * @param {PropertyKey[]} path Current property or array-index path.
 * @param {ValidationIssue[]} issues Array to collect validation issues in.
 * @param {number} depth Current nesting depth.
 * @param {number} maxDepth Maximum allowed nesting depth.
 * @returns {unknown}
 */
function validate(schema, value, path, issues, depth, maxDepth) {
  if (depth > maxDepth) {
    return issue(issues, path, `nesting depth <= ${maxDepth}`, value);
  }

  switch (schema.kind) {
    case "any":
    case "unknown":
      return value;

    case "never":
      return issue(issues, path, "never", value);

    case "string":
    case "boolean":
    case "bigint":
    case "symbol":
    case "undefined":
      return typeof value === schema.kind
        ? value
        : issue(issues, path, schema.kind, value);

    case "null":
      return value === null ? value : issue(issues, path, "null", value);

    case "number": {
      if (typeof value !== "number") return issue(issues, path, "number", value);
      if (schema.finite && !Number.isFinite(value)) {
        return issue(issues, path, "finite number", value);
      }
      if (schema.integer && !Number.isInteger(value)) {
        return issue(issues, path, "integer", value);
      }
      if (schema.safeInteger && !Number.isSafeInteger(value)) {
        return issue(issues, path, "safe integer", value);
      }
      if (value < schema.min || value > schema.max) {
        return issue(issues, path, `number in [${schema.min}, ${schema.max}]`, value);
      }
      return value;
    }

    case "literal":
      return Object.is(value, schema.value)
        ? value
        : issue(issues, path, `literal ${String(schema.value)}`, value);

    case "optional":
      return value === undefined
        ? undefined
        : validate(schema.inner, value, path, issues, depth + 1, maxDepth);

    case "nullable":
      return value === null
        ? null
        : validate(schema.inner, value, path, issues, depth + 1, maxDepth);

    case "array": {
      if (!Array.isArray(value)) return issue(issues, path, "array", value);
      if (value.length < schema.min || value.length > schema.max) {
        return issue(issues, path, `array length ${schema.min}..${schema.max}`, value);
      }

      const result = [];
      for (let i = 0; i < value.length; i++) {
        if (!Object.hasOwn(value, i)) {
          return issue(issues, [...path, i], "array element (no holes)", undefined);
        }
        const parsed = validate(
          schema.item, value[i], [...path, i], issues, depth + 1, maxDepth
        );
        if (parsed === INVALID) return INVALID;
        result.push(parsed);
      }
      return result;
    }

    case "tuple": {
      if (!Array.isArray(value) || value.length !== schema.items.length) {
        return issue(issues, path, `tuple of length ${schema.items.length}`, value);
      }

      const result = [];
      for (let i = 0; i < schema.items.length; i++) {
        if (!Object.hasOwn(value, i)) {
          return issue(issues, [...path, i], "tuple element (no holes)", undefined);
        }
        const parsed = validate(
          schema.items[i], value[i], [...path, i], issues, depth + 1, maxDepth
        );
        if (parsed === INVALID) return INVALID;
        result.push(parsed);
      }
      return result;
    }

    case "object": {
      if (!isPlainRecord(value)) {
        return issue(issues, path, "plain object", value);
      }

      /** @type {Record<PropertyKey, unknown>} */
      const objectValue = /** @type {Record<PropertyKey, unknown>} */ (value);
      
      /** @type {Array<Array<*>>} */
      const entries = schema.entries;
      
      /** @type {Set<PropertyKey>} */
      const knownKeys = new Set(entries.map(([key]) => key));

      const extraKeys = Reflect.ownKeys(objectValue).filter(key =>
        Object.prototype.propertyIsEnumerable.call(objectValue, key) &&
        !knownKeys.has(key)
      );

      if (schema.unknownKeys === "strict" && extraKeys.length > 0) {
        return issue(
          issues,
          [...path, extraKeys[0]],
          "no unknown property",
          objectValue[extraKeys[0]]
        );
      }

      const result = {};
      for (const [key, childSchema] of entries) {
        if (!Object.hasOwn(objectValue, key)) {
          if (childSchema.kind === "optional") continue;
          return issue(issues, [...path, key], "required property", undefined);
        }

        const parsed = validate(
          childSchema, objectValue[key], [...path, key],
          issues, depth + 1, maxDepth
        );
        if (parsed === INVALID) return INVALID;
        defineValue(result, key, parsed);
      }

      if (schema.unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          defineValue(result, key, objectValue[key]);
        }
      }
      return result;
    }

    case "record": {
      if (!isPlainRecord(value)) {
        return issue(issues, path, "plain record", value);
      }
    
      /** @type {Record<string, unknown>} */
      const recordValue = /** @type {Record<string, unknown>} */ (value);
    
      const result = {};
      for (const key of Object.keys(recordValue)) {
        const parsed = validate(
          schema.valueSchema,
          recordValue[key],
          [...path, key],
          issues,
          depth + 1,
          maxDepth
        );
    
        if (parsed === INVALID) return INVALID;
    
        defineValue(result, key, parsed);
      }
    
      return result;
    }

    case "union": {
      for (const alternative of schema.schemas) {
        /** @type {ValidationIssue[]} */
        const branchIssues = [];

        const parsed = validate(
          alternative, value, path, branchIssues, depth + 1, maxDepth
        );
        if (parsed !== INVALID) return parsed;
      }
      return issue(issues, path, "one of the union alternatives", value);
    }

    case "instanceOf": {
      try {
        return value instanceof schema.constructor
          ? value
          : issue(issues, path, `instance of ${schema.constructor.name}`, value);
      } catch {
        return issue(issues, path, `instance of ${schema.constructor.name}`, value);
      }
    }

    case "exactPrototype":
      return value !== null &&
        (typeof value === "object" || typeof value === "function") &&
        Object.getPrototypeOf(value) === schema.prototype
        ? value
        : issue(issues, path, "exact prototype match", value);

    case "custom": {
      try {
        return schema.check(value)
          ? value
          : issue(issues, path, schema.description, value);
      } catch {
        return issue(issues, path, schema.description, value);
      }
    }

    case "lazy": {
      const inner = schema.getter();
      if (!isSchema(inner)) {
        throw new TypeError("lazy() getter must return a schema");
      }
      return validate(inner, value, path, issues, depth + 1, maxDepth);
    }

    default:
      throw new TypeError(`Unknown schema kind: ${schema.kind}`);
  }
}

/**
 * Error thrown by `parse` when validation fails. The structured `issues`
 * property is also available to callers who need machine-readable details.
 *
 * @param issues Validation issues describing the failure.
 */
class ValidationError extends TypeError {
  /**
   * @param {ValidationIssue[]} issues
   */
  constructor(issues) {
    super(issues.map(e =>
      `${e.path}: expected ${e.expected}, received ${e.received}`
    ).join("\n"));
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/**
 * Validates without throwing for ordinary validation failures.
 *
 * @param {Schema} schema Schema descriptor to validate against.
 * @param {unknown} value Value to validate.
 * @param {ParseOptions} [options] Optional validation settings.
 * @returns {{
 *   success: true,
 *   data: unknown
 * } | {
 *   success: false,
 *   error: ValidationError
 * }}
 */
function safeParse(schema, value, { maxDepth = 100 } = {}) {
  if (!isSchema(schema)) {
    throw new TypeError("Expected a schema from v.*");
  }

  /** @type {ValidationIssue[]} */
  const issues = [];

  try {
    const data = validate(schema, value, [], issues, 0, maxDepth);
    return data === INVALID
      ? { success: false, error: new ValidationError(issues) }
      : { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: new ValidationError([{
        path: "<root>",
        expected: "value that can be inspected",
        received: error instanceof Error ? error.message : "inspection error",
      }]),
    };
  }
}

/**
 * Returns whether the value satisfies the schema.
 *
 * @param {Schema} schema
 * @param {unknown} value
 * @returns {boolean}
 */
function matches(schema, value) {
  return safeParse(schema, value).success;
}

/**
 * Validates and returns the parsed value, or throws a `ValidationError`.
 *
 * The JavaScript API checks values at runtime but does not infer a
 * corresponding TypeScript type from the schema.
 *
 * @param {Schema} schema Schema descriptor to validate against.
 * @param {unknown} value Value to validate.
 * @param {ParseOptions} [options] Optional validation settings.
 * @returns {unknown}
 * @throws {ValidationError} When the value does not satisfy the schema.
 */
function parse(schema, value, options) {
  const result = safeParse(schema, value, options);
  if ("error" in result) throw result.error;
  return result.data;
}

export {
  v,
  ValidationError,
  safeParse,
  parse,
  matches,
};
