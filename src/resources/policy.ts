import type { MCPServer } from "@lynq/lynq";
import type { PolicyGuard } from "../guard/policy-guard.js";

export function registerPolicyResource(server: MCPServer, policyGuard: PolicyGuard) {
	server.resource(
		"wallet://policy",
		{
			name: "Spending Policy",
			description: "Current spending policy configuration",
			mimeType: "application/json",
		},
		() => ({
			text: JSON.stringify(policyGuard.policy),
		}),
	);
}
