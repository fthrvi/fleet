// Tiny purpose-built expression evaluator for workflow `whenExpr` conditions
// and `${{ ... }}` placeholders in recipe overrides. We hand-roll a parser
// rather than use eval/new Function() so the runtime is provably safe.
//
// Supported grammar (recursive-descent):
//
//   or       := and ('||' and)*
//   and      := unary ('&&' unary)*
//   unary    := '!' unary | comp
//   comp     := atom (('==' | '!=' | '>=' | '<=' | '>' | '<') atom)?
//   atom     := literal | path | '(' or ')'
//   literal  := STRING | NUMBER | 'true' | 'false' | 'null'
//   path     := IDENT ('.' IDENT)*
//
// Where IDENT references the run context (`steps.<name>.<...>` or `run.<key>`).

export interface ExprContext {
  steps: Record<string, StepCtx>;
  run: { id: number; triggeredBy: string };
}

export interface StepCtx {
  status: string;
  exitCode: number | null;
  outputs: Record<string, string>;
}

type Token =
  | { kind: "ident"; value: string }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "punct"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      let s = "";
      while (j < input.length && input[j] !== quote) {
        if (input[j] === "\\" && j + 1 < input.length) {
          s += input[j + 1];
          j += 2;
        } else {
          s += input[j];
          j++;
        }
      }
      if (j >= input.length) throw new Error("unterminated string");
      tokens.push({ kind: "string", value: s });
      i = j + 1;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      tokens.push({ kind: "number", value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j++;
      tokens.push({ kind: "ident", value: input.slice(i, j) });
      i = j;
      continue;
    }
    // Multi-char operators
    const two = input.slice(i, i + 2);
    if (["==", "!=", ">=", "<=", "&&", "||"].includes(two)) {
      tokens.push({ kind: "punct", value: two });
      i += 2;
      continue;
    }
    if ("()!.>< ,".includes(c)) {
      tokens.push({ kind: "punct", value: c });
      i++;
      continue;
    }
    throw new Error(`unexpected char '${c}' at ${i}`);
  }
  return tokens;
}

class Parser {
  pos = 0;
  constructor(public tokens: Token[], public ctx: ExprContext) {}

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  next(): Token | undefined {
    return this.tokens[this.pos++];
  }
  match(kind: Token["kind"], value: string): boolean {
    const t = this.peek();
    if (t && t.kind === kind && (t as { value: string }).value === value) {
      this.pos++;
      return true;
    }
    return false;
  }

  parseOr(): unknown {
    let left = this.parseAnd();
    while (this.match("punct", "||")) {
      const right = this.parseAnd();
      left = !!left || !!right;
    }
    return left;
  }
  parseAnd(): unknown {
    let left = this.parseUnary();
    while (this.match("punct", "&&")) {
      const right = this.parseUnary();
      left = !!left && !!right;
    }
    return left;
  }
  parseUnary(): unknown {
    if (this.match("punct", "!")) {
      const inner = this.parseUnary();
      return !inner;
    }
    return this.parseComp();
  }
  parseComp(): unknown {
    const left = this.parseAtom();
    const t = this.peek();
    if (t && t.kind === "punct" && ["==", "!=", ">=", "<=", ">", "<"].includes(t.value)) {
      this.pos++;
      const right = this.parseAtom();
      const ls = String(left ?? "");
      const rs = String(right ?? "");
      const ln = Number(left);
      const rn = Number(right);
      switch (t.value) {
        case "==":
          return ls === rs;
        case "!=":
          return ls !== rs;
        case ">":
          return ln > rn;
        case "<":
          return ln < rn;
        case ">=":
          return ln >= rn;
        case "<=":
          return ln <= rn;
      }
    }
    return left;
  }
  parseAtom(): unknown {
    const t = this.peek();
    if (!t) throw new Error("unexpected end of expression");
    if (t.kind === "punct" && t.value === "(") {
      this.pos++;
      const inner = this.parseOr();
      if (!this.match("punct", ")")) throw new Error("missing )");
      return inner;
    }
    if (t.kind === "number" || t.kind === "string") {
      this.pos++;
      return t.value;
    }
    if (t.kind === "ident") {
      this.pos++;
      if (t.value === "true") return true;
      if (t.value === "false") return false;
      if (t.value === "null") return null;
      // path: root then dotted lookups
      let cursor: unknown =
        t.value === "steps"
          ? (this.ctx.steps as unknown)
          : t.value === "run"
          ? (this.ctx.run as unknown)
          : undefined;
      while (this.match("punct", ".")) {
        const part = this.next();
        if (!part || part.kind !== "ident") throw new Error("expected identifier after .");
        if (cursor && typeof cursor === "object") {
          cursor = (cursor as Record<string, unknown>)[part.value];
        } else {
          cursor = undefined;
        }
      }
      return cursor;
    }
    throw new Error(`unexpected token: ${JSON.stringify(t)}`);
  }
}

function evalExpr(expr: string, ctx: ExprContext): unknown {
  const tokens = tokenize(expr);
  if (tokens.length === 0) return undefined;
  const parser = new Parser(tokens, ctx);
  const result = parser.parseOr();
  if (parser.pos !== parser.tokens.length) {
    throw new Error(`trailing tokens at ${parser.pos}`);
  }
  return result;
}

export function evaluateWhen(expr: string, ctx: ExprContext): boolean {
  if (!expr || !expr.trim()) return true;
  try {
    return !!evalExpr(expr, ctx);
  } catch (err) {
    console.warn("[workflow-expr] eval failed:", err);
    return false;
  }
}

/**
 * Recursively walk a JSON value, substituting any `${{ expr }}` placeholders
 * in string leaves with their resolved values. Non-strings pass through.
 */
export function substituteRecipe<T>(value: T, ctx: ExprContext): T {
  if (typeof value === "string") {
    return substituteString(value, ctx) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => substituteRecipe(v, ctx)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = substituteRecipe(v, ctx);
    }
    return out as unknown as T;
  }
  return value;
}

const PLACEHOLDER = /\$\{\{\s*([^}]+?)\s*\}\}/g;

function substituteString(s: string, ctx: ExprContext): string {
  return s.replace(PLACEHOLDER, (_, expr: string) => {
    try {
      const v = evalExpr(expr, ctx);
      return v == null ? "" : String(v);
    } catch {
      return "";
    }
  });
}

/**
 * Scan a block of stdout text for `::output name=KEY::VALUE` lines (mirrors
 * the legacy GitHub Actions set-output syntax). Useful in shell steps:
 *
 *     echo "::output name=tag::v1.2.3"
 *     echo "::output name=passed::true"
 */
export function parseOutputs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text) return out;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^::output\s+name=([A-Za-z_][A-Za-z0-9_]*)::(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
