import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ValidationError,
  matches,
  parse,
  safeParse,
  v,
} from "../assort.mjs";

describe("primitive schemas", () => {
  it("accepts matching primitive values", () => {
    assert.equal(matches(v.string(), "hello"), true);
    assert.equal(matches(v.boolean(), false), true);
    assert.equal(matches(v.null(), null), true);
    assert.equal(matches(v.undefined(), undefined), true);
  });

  it("rejects values with the wrong primitive type", () => {
    assert.equal(matches(v.string(), 42), false);
    assert.equal(matches(v.null(), undefined), false);
  });

  it("supports any, unknown, and never schemas", () => {
    assert.equal(matches(v.any(), { anything: true }), true);
    assert.equal(matches(v.unknown(), undefined), true);
    assert.equal(matches(v.never(), "anything"), false);
  });
});

describe("number schemas", () => {
  it("enforces numeric constraints", () => {
    const schema = v.number({
      finite: true,
      integer: true,
      min: 1,
      max: 10,
    });

    assert.equal(matches(schema, 5), true);
    assert.equal(matches(schema, 0), false);
    assert.equal(matches(schema, 1.5), false);
    assert.equal(matches(schema, Infinity), false);
  });

  it("checks safe integers when requested", () => {
    const schema = v.number({ safeInteger: true });

    assert.equal(matches(schema, Number.MAX_SAFE_INTEGER), true);
    assert.equal(matches(schema, Number.MAX_SAFE_INTEGER + 1), false);
  });
});

describe("composite schemas", () => {
  it("validates and returns a parsed array", () => {
    const result = parse(v.array(v.string()), ["one", "two"]);

    assert.deepEqual(result, ["one", "two"]);
    assert.notEqual(result, undefined);
  });

  it("rejects sparse arrays", () => {
    const sparse = [];
    sparse.length = 1;

    assert.equal(matches(v.array(v.string()), sparse), false);
  });

  it("validates tuple length and element schemas", () => {
    const schema = v.tuple([v.string(), v.number()]);

    assert.equal(matches(schema, ["age", 42]), true);
    assert.equal(matches(schema, ["age"]), false);
    assert.equal(matches(schema, ["age", "42"]), false);
  });

  it("validates object properties and reports a useful path", () => {
    const schema = v.object({
      profile: v.object({
        age: v.number(),
      }),
    });

    const result = safeParse(schema, { profile: { age: "old" } });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error instanceof ValidationError);
      assert.match(result.error.message, /profile\]\[age\]/);
    }
  });

  it("allows missing optional object properties", () => {
    const schema = v.object({
      name: v.string(),
      nickname: v.optional(v.string()),
    });

    assert.deepEqual(parse(schema, { name: "Ada" }), { name: "Ada" });
  });

  it("handles unknown object keys according to the selected mode", () => {
    const input = { name: "Ada", extra: true };

    assert.equal(matches(v.object({ name: v.string() }), input), false);

    assert.deepEqual(
      parse(v.object({ name: v.string() }, { unknownKeys: "strip" }), input),
      { name: "Ada" }
    );

    assert.deepEqual(
      parse(
        v.object({ name: v.string() }, { unknownKeys: "passthrough" }),
        input
      ),
      input
    );
  });

  it("validates records", () => {
    const schema = v.record(v.number());

    assert.equal(matches(schema, { first: 1, second: 2 }), true);
    assert.equal(matches(schema, { first: "one" }), false);
  });
});

describe("wrappers and unions", () => {
  it("supports optional and nullable schemas", () => {
    assert.equal(matches(v.optional(v.string()), undefined), true);
    assert.equal(matches(v.optional(v.string()), "value"), true);
    assert.equal(matches(v.nullable(v.string()), null), true);
    assert.equal(matches(v.nullable(v.string()), undefined), false);
  });

  it("accepts values matching any union alternative", () => {
    const schema = v.union([v.string(), v.number()]);

    assert.equal(matches(schema, "value"), true);
    assert.equal(matches(schema, 10), true);
    assert.equal(matches(schema, false), false);
  });

  it("supports literal values", () => {
    assert.equal(matches(v.literal("ready"), "ready"), true);
    assert.equal(matches(v.literal("ready"), "pending"), false);
    assert.equal(matches(v.literal(NaN), NaN), true);
  });
});

describe("custom and recursive schemas", () => {
  it("supports custom predicates", () => {
    const positive = v.custom(
      value => typeof value === "number" && value > 0,
      "positive number"
    );

    assert.equal(matches(positive, 2), true);
    assert.equal(matches(positive, -1), false);
  });

  it("treats a throwing custom predicate as a validation failure", () => {
    const schema = v.custom(() => {
      throw new Error("predicate failed");
    });

    assert.equal(matches(schema, "value"), false);
  });

  it("validates recursive values with lazy schemas", () => {
    const node = v.lazy(() =>
      v.object({
        value: v.string(),
        children: v.array(node),
      })
    );

    assert.equal(
      matches(node, {
        value: "root",
        children: [{ value: "child", children: [] }],
      }),
      true
    );

    assert.equal(
      matches(node, {
        value: "root",
        children: [{ value: 123, children: [] }],
      }),
      false
    );
  });
});

describe("parse and safeParse", () => {
  it("returns a success result from safeParse", () => {
    assert.deepEqual(safeParse(v.string(), "ok"), {
      success: true,
      data: "ok",
    });
  });

  it("returns a failure result from safeParse", () => {
    const result = safeParse(v.string(), 123);

    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error instanceof ValidationError);
      assert.match(result.error.message, /expected string/);
    }
  });

  it("throws ValidationError from parse on invalid input", () => {
    assert.throws(
      () => parse(v.number(), "not a number"),
      ValidationError
    );
  });

  it("rejects non-schema arguments", () => {
    assert.throws(() => safeParse({}, "value"), TypeError);
  });

  it("honors the maximum nesting depth", () => {
    const schema = v.array(v.array(v.string()));

    assert.equal(
      safeParse(schema, [["nested"]], { maxDepth: 0 }).success,
      false
    );
  });
});
