import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// 定义 Env 接口
interface Env {
    [key: string]: any;
}

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
    server = new McpServer({
        name: "Authless Calculator",
        version: "1.0.0",
    });
    
    private pyodide: any = null;
    private pyodideInitialized = false;

    async init() {
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

        // Python代码执行工具 - 延迟初始化Pyodide
        this.server.tool(
            "execute_python",
            {
                code: z.string().describe("要执行的Python代码，支持完整的Python语法和标准库"),
            },
            async ({ code }) => {
                try {
                    // 延迟初始化 Pyodide
                    if (!this.pyodideInitialized) {
                        await this.initializePyodide();
                    }
                    
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

    // 延迟初始化 Pyodide
    private async initializePyodide() {
        if (this.pyodideInitialized) return;

        const indexURL = "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/";

        try {
            // Worker 中通过 importScripts 同步加载 pyodide.js
            (globalThis as any).importScripts(indexURL + "pyodide.js");
            // loadPyodide 挂在到全局
            this.pyodide = await (globalThis as any).loadPyodide({ indexURL });
            this.pyodideInitialized = true;
        } catch (error) {
            console.error("Failed to initialize Pyodide:", error);
            throw new Error("Python 环境初始化失败，请稍后重试");
        }
    }

    // 使用Pyodide执行Python代码
    private async executePythonCode(code: string): Promise<string> {
        if (!this.pyodide || !this.pyodideInitialized) {
            throw new Error("Python环境未初始化");
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
            try {
                this.pyodide.runPython(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
                `);
            } catch (resetError) {
                console.error("Failed to reset Python stdout/stderr:", resetError);
            }
            throw error;
        }
    }
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        try {
            const url = new URL(request.url);

            // 处理 SSE 端点
            if (url.pathname === "/sse" || url.pathname === "/sse/message") {
                return MyMCP.serveSSE("/sse").fetch(request, env as any, ctx);
            }

            // 处理 MCP 端点
            if (url.pathname === "/mcp") {
                return MyMCP.serve("/mcp").fetch(request, env as any, ctx);
            }

            // 添加健康检查端点
            if (url.pathname === "/health") {
                return new Response("OK", { status: 200 });
            }

            // 添加根路径响应
            if (url.pathname === "/") {
                return new Response("MCP Server is running", { 
                    status: 200,
                    headers: { "Content-Type": "text/plain" }
                });
            }

            return new Response("Not found", { status: 404 });
        } catch (error) {
            console.error("Error in fetch handler:", error);
            return new Response("Internal Server Error", { 
                status: 500,
                headers: { "Content-Type": "text/plain" }
            });
        }
    },
};
