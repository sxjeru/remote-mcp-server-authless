import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Authless Calculator",
		version: "1.0.0",
	});

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

			// 通用Python代码执行工具
		this.server.tool(
			"execute_python",
			{
				code: z.string().describe("要执行的Python代码，支持基本库函数、数据处理、字符串操作、循环、条件语句等通用编程功能"),
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

	// Python执行环境
	private async executePythonCode(code: string): Promise<string> {
		const interpreter = new PythonInterpreter();
		return interpreter.execute(code);
	}
	
	// ...existing code...
}

// 通用Python解释器类
class PythonInterpreter {
	private variables: Map<string, any> = new Map();
	private output: string[] = [];
	private builtins: Map<string, Function> = new Map();
	private modules: Map<string, any> = new Map();
	
	constructor() {
		this.initBuiltins();
		this.initModules();
	}
	
	// 主执行方法
	execute(code: string): string {
		this.output = [];
		
		try {
			// 预处理代码
			const lines = this.preprocessCode(code);
			
			// 逐行执行
			this.executeLines(lines);
			
			// 返回输出
			return this.output.length > 0 ? this.output.join('\n') : '代码执行完成';
			
		} catch (error) {
			throw new Error(`Python执行错误: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	
	private initBuiltins() {
		// 输入输出函数
		this.builtins.set('print', (...args: any[]) => {
			const output = args.map(arg => this.formatValue(arg)).join(' ');
			this.output.push(output);
		});
		
		this.builtins.set('input', (prompt = '') => {
			this.output.push(prompt);
			return 'user_input'; // 模拟用户输入
		});
		
		// 类型相关函数
		this.builtins.set('len', (obj: any) => {
			if (typeof obj === 'string' || Array.isArray(obj) || obj instanceof Map || obj instanceof Set) {
				return Array.isArray(obj) ? obj.length : obj.size || obj.length;
			}
			if (typeof obj === 'object' && obj !== null) {
				return Object.keys(obj).length;
			}
			throw new Error('object has no len()');
		});
		
		this.builtins.set('type', (obj: any) => {
			if (Array.isArray(obj)) return 'list';
			if (obj === null) return 'NoneType';
			return typeof obj;
		});
		
		this.builtins.set('isinstance', (obj: any, type: string) => {
			const objType = this.builtins.get('type')!(obj);
			return objType === type;
		});
		
		// 类型转换函数
		this.builtins.set('str', (obj: any) => String(obj));
		this.builtins.set('int', (obj: any) => {
			const num = parseInt(String(obj));
			if (isNaN(num)) throw new Error(`invalid literal for int(): ${obj}`);
			return num;
		});
		this.builtins.set('float', (obj: any) => {
			const num = parseFloat(String(obj));
			if (isNaN(num)) throw new Error(`could not convert string to float: ${obj}`);
			return num;
		});
		this.builtins.set('bool', (obj: any) => Boolean(obj));
		this.builtins.set('list', (obj: any) => {
			if (typeof obj === 'string') return obj.split('');
			if (Array.isArray(obj)) return [...obj];
			if (obj && typeof obj[Symbol.iterator] === 'function') return Array.from(obj);
			return [obj];
		});
		this.builtins.set('dict', (obj: any = {}) => typeof obj === 'object' && obj !== null ? {...obj} : {});
		this.builtins.set('set', (obj: any = []) => new Set(Array.isArray(obj) ? obj : [obj]));
		this.builtins.set('tuple', (obj: any = []) => Array.isArray(obj) ? Object.freeze([...obj]) : Object.freeze([obj]));
		
		// 数学函数
		this.builtins.set('abs', (x: number) => Math.abs(x));
		this.builtins.set('max', (...args: any[]) => {
			const flatArgs = args.flat();
			return Math.max(...flatArgs.map(Number));
		});
		this.builtins.set('min', (...args: any[]) => {
			const flatArgs = args.flat();
			return Math.min(...flatArgs.map(Number));
		});
		this.builtins.set('sum', (arr: number[], start = 0) => {
			return arr.reduce((a, b) => a + Number(b), start);
		});
		this.builtins.set('round', (x: number, digits = 0) => {
			return Math.round(x * Math.pow(10, digits)) / Math.pow(10, digits);
		});
		this.builtins.set('pow', (x: number, y: number, mod?: number) => {
			const result = Math.pow(x, y);
			return mod ? result % mod : result;
		});
		this.builtins.set('divmod', (a: number, b: number) => [Math.floor(a / b), a % b]);
		
		// 序列函数
		this.builtins.set('range', (...args: number[]) => {
			let start = 0, stop = 0, step = 1;
			
			if (args.length === 1) {
				stop = args[0];
			} else if (args.length === 2) {
				start = args[0];
				stop = args[1];
			} else if (args.length === 3) {
				start = args[0];
				stop = args[1];
				step = args[2];
			}
			
			const result = [];
			if (step > 0) {
				for (let i = start; i < stop; i += step) {
					result.push(i);
				}
			} else {
				for (let i = start; i > stop; i += step) {
					result.push(i);
				}
			}
			return result;
		});
		
		this.builtins.set('enumerate', (iterable: any[], start = 0) => {
			return iterable.map((item, index) => [index + start, item]);
		});
		
		this.builtins.set('zip', (...iterables: any[][]) => {
			const minLength = Math.min(...iterables.map(arr => arr.length));
			const result = [];
			for (let i = 0; i < minLength; i++) {
				result.push(iterables.map(arr => arr[i]));
			}
			return result;
		});
		
		this.builtins.set('sorted', (arr: any[], reverse = false) => {
			const sorted = [...arr].sort();
			return reverse ? sorted.reverse() : sorted;
		});
		
		this.builtins.set('reversed', (arr: any[]) => [...arr].reverse());
		
		this.builtins.set('filter', (func: Function | null, iterable: any[]) => {
			if (func === null) {
				return iterable.filter(Boolean);
			}
			return iterable.filter(func);
		});
		
		this.builtins.set('map', (func: Function, iterable: any[]) => {
			return iterable.map(func);
		});
		
		this.builtins.set('any', (iterable: any[]) => iterable.some(Boolean));
		this.builtins.set('all', (iterable: any[]) => iterable.every(Boolean));
		
		// 字符串和编码函数
		this.builtins.set('ord', (char: string) => char.charCodeAt(0));
		this.builtins.set('chr', (code: number) => String.fromCharCode(code));
		this.builtins.set('ascii', (obj: any) => JSON.stringify(String(obj)));
		this.builtins.set('repr', (obj: any) => this.formatValue(obj));
		
		// 文件操作函数（模拟）
		this.builtins.set('open', (filename: string, mode = 'r') => {
			return {
				filename,
				mode,
				content: `模拟文件内容: ${filename}`,
				read: () => `模拟读取文件 ${filename} 的内容`,
				write: (data: string) => `模拟写入到文件 ${filename}: ${data}`,
				close: () => `文件 ${filename} 已关闭`
			};
		});
		
		// 对象属性函数
		this.builtins.set('hasattr', (obj: any, attr: string) => {
			return obj && typeof obj === 'object' && attr in obj;
		});
		
		this.builtins.set('getattr', (obj: any, attr: string, defaultValue?: any) => {
			if (obj && typeof obj === 'object' && attr in obj) {
				return obj[attr];
			}
			if (defaultValue !== undefined) return defaultValue;
			throw new Error(`'${typeof obj}' object has no attribute '${attr}'`);
		});
		
		this.builtins.set('setattr', (obj: any, attr: string, value: any) => {
			if (obj && typeof obj === 'object') {
				obj[attr] = value;
			}
		});
		
		this.builtins.set('dir', (obj?: any) => {
			if (obj === undefined) {
				return Array.from(this.variables.keys());
			}
			if (obj && typeof obj === 'object') {
				return Object.keys(obj);
			}
			return [];
		});
		
		// 其他实用函数
		this.builtins.set('id', (obj: any) => {
			return Math.abs(JSON.stringify(obj).split('').reduce((a, b) => {
				a = ((a << 5) - a) + b.charCodeAt(0);
				return a & a;
			}, 0));
		});
		
		this.builtins.set('hash', (obj: any) => {
			return Math.abs(JSON.stringify(obj).split('').reduce((hash, char) => {
				return ((hash << 5) - hash) + char.charCodeAt(0);
			}, 0));
		});
		
		this.builtins.set('eval', (expression: string) => {
			return this.evaluateExpression(expression);
		});
		
		this.builtins.set('exec', (code: string) => {
			const lines = this.preprocessCode(code);
			this.executeLines(lines);
			return null;
		});
	}
	
	private initModules() {
		// math模块
		this.modules.set('math', {
			pi: Math.PI,
			e: Math.E,
			sqrt: (x: number) => Math.sqrt(x),
			sin: (x: number) => Math.sin(x),
			cos: (x: number) => Math.cos(x),
			tan: (x: number) => Math.tan(x),
			asin: (x: number) => Math.asin(x),
			acos: (x: number) => Math.acos(x),
			atan: (x: number) => Math.atan(x),
			log: (x: number, base?: number) => base ? Math.log(x) / Math.log(base) : Math.log(x),
			log10: (x: number) => Math.log10(x),
			exp: (x: number) => Math.exp(x),
			ceil: (x: number) => Math.ceil(x),
			floor: (x: number) => Math.floor(x),
			degrees: (x: number) => x * 180 / Math.PI,
			radians: (x: number) => x * Math.PI / 180,
			factorial: (n: number) => {
				if (n < 0) throw new Error('factorial() not defined for negative values');
				let result = 1;
				for (let i = 2; i <= n; i++) result *= i;
				return result;
			}
		});
		
		// random模块
		this.modules.set('random', {
			random: () => Math.random(),
			randint: (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a,
			choice: (arr: any[]) => arr[Math.floor(Math.random() * arr.length)],
			shuffle: (arr: any[]) => {
				for (let i = arr.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[arr[i], arr[j]] = [arr[j], arr[i]];
				}
				return arr;
			},
			sample: (arr: any[], k: number) => {
				const shuffled = [...arr];
				this.modules.get('random').shuffle(shuffled);
				return shuffled.slice(0, k);
			}
		});
		
		// datetime模块（简化版）
		this.modules.set('datetime', {
			datetime: {
				now: () => ({
					year: new Date().getFullYear(),
					month: new Date().getMonth() + 1,
					day: new Date().getDate(),
					hour: new Date().getHours(),
					minute: new Date().getMinutes(),
					second: new Date().getSeconds(),
					toString: () => new Date().toISOString()
				}),
				today: () => new Date().toISOString().split('T')[0]
			},
			time: () => Math.floor(Date.now() / 1000)
		});
		
		// json模块
		this.modules.set('json', {
			loads: (str: string) => JSON.parse(str),
			dumps: (obj: any, indent?: number) => JSON.stringify(obj, null, indent)
		});
		
		// re模块（简化版）
		this.modules.set('re', {
			search: (pattern: string, text: string) => {
				const match = text.match(new RegExp(pattern));
				return match ? { group: () => match[0], groups: () => match.slice(1) } : null;
			},
			findall: (pattern: string, text: string) => {
				const matches = text.match(new RegExp(pattern, 'g'));
				return matches || [];
			},
			sub: (pattern: string, replacement: string, text: string) => {
				return text.replace(new RegExp(pattern, 'g'), replacement);
			}
		});
		
		// os模块（模拟版）
		this.modules.set('os', {
			getcwd: () => '/simulated/current/directory',
			listdir: (path = '.') => ['file1.txt', 'file2.py', 'folder1'],
			path: {
				join: (...paths: string[]) => paths.join('/'),
				exists: (path: string) => true, // 模拟所有路径都存在
				isfile: (path: string) => path.includes('.'),
				isdir: (path: string) => !path.includes('.')
			}
		});
		
		// sys模块（模拟版）
		this.modules.set('sys', {
			version: '3.9.0 (simulated)',
			platform: 'cloudflare-workers',
			argv: ['python'],
			exit: (code = 0) => { throw new Error(`程序退出，退出码: ${code}`); }
		});
	}

	private preprocessCode(code: string): string[] {
		// 移除注释和空行
		const lines = code.split('\n')
			.map(line => line.replace(/#.*$/, '').trimRight())
			.filter(line => line.length > 0);
		
		return lines;
	}
	
	private executeLines(lines: string[]) {
		let i = 0;
		
		while (i < lines.length) {
			const line = lines[i].trim();
			
			// 处理控制结构
			if (line.startsWith('for ')) {
				i = this.executeForLoop(lines, i);
			} else if (line.startsWith('if ')) {
				i = this.executeIfStatement(lines, i);
			} else if (line.startsWith('while ')) {
				i = this.executeWhileLoop(lines, i);
			} else {
				// 执行单行语句
				this.executeLine(line);
				i++;
			}
		}
	}
	
	private executeForLoop(lines: string[], startIndex: number): number {
		const forLine = lines[startIndex];
		const match = forLine.match(/for\s+(\w+)\s+in\s+(.+):/);
		
		if (!match) {
			throw new Error(`无效的for循环语法: ${forLine}`);
		}
		
		const [, varName, iterableExpr] = match;
		const iterable = this.evaluateExpression(iterableExpr);
		
		if (!Array.isArray(iterable)) {
			throw new Error(`${iterableExpr} 不是可迭代对象`);
		}
		
		// 找到循环体
		const loopBody = this.getIndentedBlock(lines, startIndex + 1);
		
		// 执行循环
		for (const item of iterable) {
			this.variables.set(varName, item);
			this.executeLines(loopBody);
		}
		
		return startIndex + 1 + loopBody.length;
	}
	
	private executeIfStatement(lines: string[], startIndex: number): number {
		const ifLine = lines[startIndex];
		const match = ifLine.match(/if\s+(.+):/);
		
		if (!match) {
			throw new Error(`无效的if语句语法: ${ifLine}`);
		}
		
		const condition = this.evaluateExpression(match[1]);
		const ifBody = this.getIndentedBlock(lines, startIndex + 1);
		
		if (condition) {
			this.executeLines(ifBody);
		}
		
		return startIndex + 1 + ifBody.length;
	}
	
	private executeWhileLoop(lines: string[], startIndex: number): number {
		const whileLine = lines[startIndex];
		const match = whileLine.match(/while\s+(.+):/);
		
		if (!match) {
			throw new Error(`无效的while循环语法: ${whileLine}`);
		}
		
		const conditionExpr = match[1];
		const loopBody = this.getIndentedBlock(lines, startIndex + 1);
		
		let iterations = 0;
		const maxIterations = 10000; // 防止无限循环
		
		while (this.evaluateExpression(conditionExpr) && iterations < maxIterations) {
			this.executeLines(loopBody);
			iterations++;
		}
		
		if (iterations >= maxIterations) {
			throw new Error('循环迭代次数过多，可能存在无限循环');
		}
		
		return startIndex + 1 + loopBody.length;
	}
	
	private getIndentedBlock(lines: string[], startIndex: number): string[] {
		const block = [];
		
		for (let i = startIndex; i < lines.length; i++) {
			const line = lines[i];
			if (line.startsWith('    ') || line.startsWith('\t')) {
				block.push(line.replace(/^    |\t/, ''));
			} else if (line.trim() === '') {
				continue;
			} else {
				break;
			}
		}
		
		return block;
	}
	
	private executeLine(line: string) {
		// 处理import语句
		if (line.startsWith('import ') || line.startsWith('from ')) {
			this.handleImport(line);
			return;
		}
		
		// 变量赋值
		if (line.includes('=') && !line.includes('==') && !line.includes('!=') && !line.includes('<=') && !line.includes('>=')) {
			const [varName, expression] = line.split('=', 2).map(s => s.trim());
			
			// 处理多元赋值，如 a, b = 1, 2
			if (varName.includes(',')) {
				const varNames = varName.split(',').map(s => s.trim());
				const value = this.evaluateExpression(expression);
				
				if (Array.isArray(value) && value.length === varNames.length) {
					varNames.forEach((name, index) => {
						this.variables.set(name, value[index]);
					});
				} else {
					throw new Error('解包赋值的值数量不匹配');
				}
				return;
			}
			
			const value = this.evaluateExpression(expression);
			this.variables.set(varName, value);
			return;
		}
		
		// 函数调用或表达式
		const result = this.evaluateExpression(line);
		if (result !== undefined && result !== null) {
			// 如果不是赋值语句且有返回值，打印结果
			if (!line.includes('print(') && result !== '') {
				this.output.push(String(result));
			}
		}
	}
	
	private handleImport(line: string) {
		// 处理 import module
		const importMatch = line.match(/^import\s+(\w+)$/);
		if (importMatch) {
			const moduleName = importMatch[1];
			if (this.modules.has(moduleName)) {
				this.variables.set(moduleName, this.modules.get(moduleName));
			} else {
				throw new Error(`No module named '${moduleName}'`);
			}
			return;
		}
		
		// 处理 from module import function
		const fromImportMatch = line.match(/^from\s+(\w+)\s+import\s+(.+)$/);
		if (fromImportMatch) {
			const [, moduleName, imports] = fromImportMatch;
			if (this.modules.has(moduleName)) {
				const module = this.modules.get(moduleName);
				const importNames = imports.split(',').map(s => s.trim());
				
				for (const importName of importNames) {
					if (importName === '*') {
						// import all
						Object.assign(this.variables, module);
					} else if (module[importName]) {
						this.variables.set(importName, module[importName]);
					} else {
						throw new Error(`cannot import name '${importName}' from '${moduleName}'`);
					}
				}
			} else {
				throw new Error(`No module named '${moduleName}'`);
			}
			return;
		}
		
		throw new Error(`Invalid import syntax: ${line}`);
	}
	
	private evaluateExpression(expr: string): any {
		try {
			// 处理字符串字面量
			if ((expr.startsWith('"') && expr.endsWith('"')) || 
				(expr.startsWith("'") && expr.endsWith("'"))) {
				return expr.slice(1, -1);
			}
			
			// 处理列表字面量
			if (expr.startsWith('[') && expr.endsWith(']')) {
				const content = expr.slice(1, -1);
				if (content.trim() === '') return [];
				
				const items = content.split(',').map(item => this.evaluateExpression(item.trim()));
				return items;
			}
			
			// 处理方法调用 (object.method())
			const methodMatch = expr.match(/(\w+)\.(\w+)\(([^)]*)\)/);
			if (methodMatch) {
				const [, objName, methodName, argsStr] = methodMatch;
				
				if (this.variables.has(objName)) {
					const obj = this.variables.get(objName);
					if (Array.isArray(obj) && methodName === 'append') {
						const args = argsStr ? [this.evaluateExpression(argsStr.trim())] : [];
						obj.push(...args);
						return obj;
					}
				}
				
				throw new Error(`未知方法: ${objName}.${methodName}`);
			}
			
			// 处理函数调用
			const funcMatch = expr.match(/(\w+)\(([^)]*)\)/);
			if (funcMatch) {
				const [, funcName, argsStr] = funcMatch;
				
				if (this.builtins.has(funcName)) {
					const func = this.builtins.get(funcName)!;
					const args = argsStr ? argsStr.split(',').map(arg => this.evaluateExpression(arg.trim())) : [];
					return func(...args);
				}
				
				throw new Error(`未知函数: ${funcName}`);
			}
			
			// 处理变量
			if (/^\w+$/.test(expr)) {
				if (this.variables.has(expr)) {
					return this.variables.get(expr);
				}
				
				// 检查是否是数字
				if (!isNaN(Number(expr))) {
					return Number(expr);
				}
				
				throw new Error(`未定义的变量: ${expr}`);
			}
			
			// 处理数学表达式
			let processedExpr = expr;
			
			// 替换变量
			for (const [varName, value] of this.variables) {
				const regex = new RegExp(`\\b${varName}\\b`, 'g');
				processedExpr = processedExpr.replace(regex, String(value));
			}
			
			// 处理比较运算符
			if (processedExpr.includes('==') || processedExpr.includes('!=') || 
				processedExpr.includes('<=') || processedExpr.includes('>=') ||
				processedExpr.includes('<') || processedExpr.includes('>')) {
				return this.evaluateComparison(processedExpr);
			}
			
			// 处理基本数学运算
			if (/^[\d\s+\-*/().]+$/.test(processedExpr)) {
				return eval(processedExpr);
			}
			
			return processedExpr;
			
		} catch (error) {
			throw new Error(`表达式求值错误: ${expr} - ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	
	private evaluateComparison(expr: string): boolean {
		const operators = ['==', '!=', '<=', '>=', '<', '>'];
		
		for (const op of operators) {
			if (expr.includes(op)) {
				const [left, right] = expr.split(op).map(s => s.trim());
				const leftVal = this.evaluateExpression(left);
				const rightVal = this.evaluateExpression(right);
				
				switch (op) {
					case '==': return leftVal == rightVal;
					case '!=': return leftVal != rightVal;
					case '<': return leftVal < rightVal;
					case '>': return leftVal > rightVal;
					case '<=': return leftVal <= rightVal;
					case '>=': return leftVal >= rightVal;
				}
			}
		}
		
		return false;
	}
	
	private formatValue(value: any): string {
		if (Array.isArray(value)) {
			return '[' + value.map(v => this.formatValue(v)).join(', ') + ']';
		}
		
		if (typeof value === 'string') {
			return value;
		}
		
		return String(value);
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
