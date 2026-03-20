import { describe, expect, test } from "vitest";
import { VaulxError } from "../../src/errors.js";
import { parseTokenUnits, validateAddress, validateAmount } from "../../src/helpers/validate.js";

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

describe("parseTokenUnits", () => {
	test("integer", () => {
		expect(parseTokenUnits("1", 9)).toBe(1000000000n);
	});

	test("decimal", () => {
		expect(parseTokenUnits("1.5", 9)).toBe(1500000000n);
	});

	test("small decimal", () => {
		expect(parseTokenUnits("0.001", 9)).toBe(1000000n);
	});

	test("high precision — no float loss", () => {
		// float: 1.123456789 * 1e9 = 1123456788.9999998 → loses precision
		// string: should be exact
		expect(parseTokenUnits("1.123456789", 9)).toBe(1123456789n);
	});

	test("truncates excess decimals", () => {
		// 6 decimal token, input has 9 decimals → truncate to 6
		expect(parseTokenUnits("1.123456789", 6)).toBe(1123456n);
	});

	test("pads short decimals", () => {
		expect(parseTokenUnits("1.5", 18)).toBe(1500000000000000000n);
	});

	test("whole number with 18 decimals", () => {
		expect(parseTokenUnits("100", 18)).toBe(100000000000000000000n);
	});

	test("zero decimals", () => {
		expect(parseTokenUnits("42", 0)).toBe(42n);
	});

	test("invalid input throws", () => {
		expect(() => parseTokenUnits("abc", 9)).toThrow(VaulxError);
	});

	test("negative input throws", () => {
		expect(() => parseTokenUnits("-1", 9)).toThrow(VaulxError);
	});

	test("empty input throws", () => {
		expect(() => parseTokenUnits("", 9)).toThrow(VaulxError);
	});
});
