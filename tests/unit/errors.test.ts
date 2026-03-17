import { describe, expect, test } from "vitest";
import { VaulxError } from "../../src/errors.js";

describe("VaulxError", () => {
	test("instanceof Error", () => {
		const err = new VaulxError("test", "TX_FAILED");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(VaulxError);
	});

	test("has code and message", () => {
		const err = new VaulxError("something broke", "SIGNER_ERROR");
		expect(err.code).toBe("SIGNER_ERROR");
		expect(err.message).toBe("something broke");
		expect(err.name).toBe("VaulxError");
	});

	test("has optional details", () => {
		const err = new VaulxError("fail", "TX_FAILED", { chainId: 84532 });
		expect(err.details).toEqual({ chainId: 84532 });
	});

	test("details undefined when not provided", () => {
		const err = new VaulxError("fail", "TX_FAILED");
		expect(err.details).toBeUndefined();
	});
});
