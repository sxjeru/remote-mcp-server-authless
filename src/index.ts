import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadPyodide } from "pyodide";

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Authless Calculator",
		version: "1.0.0",
	});
	
	private pyodide: any = null;

	async init() {
		// Initialize Pyodide
		this.pyodide = await loadPyodide({
			indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
		});

		// Simple addition tool
		this.server.tool(
			"add",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ type: "text", text: String(a + b) }],
			})
		);

		// Calculator tool with multiple operations
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			},
			async ({ operation, a, b }) => {
				let result: number;
				switch (operation) {
					case "add":
						result = a + b;
						break;
					case "subtract":
						result = a - b;
						break;
					case "multiply":
						result = a * b;
						break;
					case "divide":
						if (b === 0)
							return {
								content: [
									{
										type: "text",
										text: "Error: Cannot divide by zero",
									},
								],
							};
						result = a / b;
						break;
				}
				return { content: [{ type: "text", text: String(result) }] };
			}
		);

		// Python代码执行工具，使用Pyodide
		this.server.tool(
			"execute_python",
			{
				code: z.string().describe("要执行的Python代码，支持完整的Python语法和标准库"),
			},
			async ({ code }) => {
				try {
					const result = await this.executePythonCode(code);
					
					return {
						content: [
							{
								type: "text",
								text: `Python代码执行结果:\n\`\`\`\n${result}\n\`\`\``
							}
						]
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text", 
								text: `执行错误: ${error instanceof Error ? error.message : String(error)}`
							}
						]
					};
				}
			}
		);
	}

	// 使用Pyodide执行Python代码
	private async executePythonCode(code: string): Promise<string> {
		if (!this.pyodide) {
			throw new Error("Pyodide未初始化");
		}

		try {
			// 捕获Python的print输出
			this.pyodide.runPython(`
import sys
from io import StringIO
sys.stdout = StringIO()
sys.stderr = StringIO()
			`);

			// 执行用户代码
			const result = this.pyodide.runPython(code);

			// 获取输出
			const stdout = this.pyodide.runPython("sys.stdout.getvalue()");
			const stderr = this.pyodide.runPython("sys.stderr.getvalue()");

			// 重置stdout和stderr
			this.pyodide.runPython(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
			`);

			// 构建返回结果
			let output = "";
			if (stdout) {
				output += stdout;
			}
			if (stderr) {
				output += "错误输出:\n" + stderr;
			}
			if (result !== undefined && result !== null && !stdout) {
				output += String(result);
			}

			return output || "代码执行完成";

		} catch (error) {
			// 重置stdout和stderr
			this.pyodide.runPython(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
			`);
			throw error;
		}
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			// @ts-ignore
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			// @ts-ignore
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
