import { describe, expect, test } from "vitest";
import { VaulxError } from "../../src/errors.js";
import { validateAddress, validateAmount } from "../../src/helpers/validate.js";

describe("validateAddress", () => {
	test("valid address", () => {
		const addr = validateAddress("0x1234567890abcdef1234567890abcdef12345678");
		expect(addr).toBe("0x1234567890abcdef1234567890abcdef12345678");
	});

	test("uppercase hex", () => {
		const addr = validateAddress("0xABCDEF1234567890ABCDEF1234567890ABCDEF12");
		expect(addr).toBe("0xABCDEF1234567890ABCDEF1234567890ABCDEF12");
	});

	test("too short", () => {
		expect(() => validateAddress("0x1234")).toThrow(VaulxError);
	});

	test("no 0x prefix", () => {
		expect(() => validateAddress("1234567890abcdef1234567890abcdef12345678")).toThrow(VaulxError);
	});

	test("non-hex characters", () => {
		expect(() => validateAddress("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG")).toThrow(VaulxError);
	});

	test("empty string", () => {
		expect(() => validateAddress("")).toThrow(VaulxError);
	});

	test("error code is CONFIG_ERROR", () => {
		try {
			validateAddress("bad");
		} catch (e) {
			expect(e).toBeInstanceOf(VaulxError);
			expect((e as VaulxError).code).toBe("CONFIG_ERROR");
		}
	});
});

describe("validateAmount", () => {
	test("valid amount", () => {
		expect(validateAmount("0.01")).toBe("0.01");
	});

	test("integer amount", () => {
		expect(validateAmount("100")).toBe("100");
	});

	test("empty string throws", () => {
		expect(() => validateAmount("")).toThrow(VaulxError);
	});

	test("whitespace-only throws", () => {
		expect(() => validateAmount("   ")).toThrow(VaulxError);
	});

	test("NaN throws", () => {
		expect(() => validateAmount("abc")).toThrow(VaulxError);
	});

	test("negative throws", () => {
		expect(() => validateAmount("-1")).toThrow(VaulxError);
	});

	test("zero throws POLICY_VIOLATION", () => {
		try {
			validateAmount("0");
		} catch (e) {
			expect(e).toBeInstanceOf(VaulxError);
			expect((e as VaulxError).code).toBe("POLICY_VIOLATION");
		}
	});

	test("custom label in error message", () => {
		try {
			validateAmount("", "value");
		} catch (e) {
			expect((e as VaulxError).message).toContain("value");
		}
	});
});
