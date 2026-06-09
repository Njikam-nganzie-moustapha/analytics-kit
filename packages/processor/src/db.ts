export type TArg = { type: 'text' | 'integer' | 'real' | 'null'; value: string | null }
export type TReq =
  | { type: 'execute'; stmt: { sql: string; args?: TArg[] } }
  | { type: 'close' }

export class TursoClient {
  constructor(private readonly url: string, private readonly token: string) {}

  async pipeline(reqs: TReq[]): Promise<unknown[]> {
    const res = await fetch(`${this.url}/v2/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: reqs }),
    })
    if (!res.ok) throw new Error(`Turso ${res.status}: ${await res.text()}`)
    return ((await res.json()) as { results: unknown[] }).results
  }

  async execute(sql: string, args?: TArg[]): Promise<unknown> {
    const [result] = await this.pipeline([{ type: 'execute', stmt: { sql, args } }, { type: 'close' }])
    return result
  }

  rows(result: unknown): Record<string, string | null>[] {
    const r = result as { response?: { result?: { cols: { name: string }[]; rows: { value?: string | null }[][] } } }
    const cols = r?.response?.result?.cols ?? []
    const rows = r?.response?.result?.rows ?? []
    return rows.map(row => Object.fromEntries(cols.map((c, i) => [c.name, row[i]?.value ?? null])))
  }

  // Convenience arg constructors
  int(v: number): TArg  { return { type: 'integer', value: String(v) } }
  txt(v: string): TArg  { return { type: 'text',    value: v } }
  real(v: number): TArg { return { type: 'real',    value: String(v) } }
  nul(): TArg           { return { type: 'null',    value: null } }

  // Chunk an array of stmts and close-request into batches, send each batch
  async batchExecute(stmts: { sql: string; args: TArg[] }[], batchSize = 100): Promise<void> {
    for (let i = 0; i < stmts.length; i += batchSize) {
      const chunk = stmts.slice(i, i + batchSize)
      const reqs: TReq[] = chunk.map(s => ({ type: 'execute', stmt: s }))
      reqs.push({ type: 'close' })
      await this.pipeline(reqs)
    }
  }
}
