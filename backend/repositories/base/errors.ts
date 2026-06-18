export class DbError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'DbError'
  }
}

export class NotFoundError extends DbError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} with id ${id} not found`)
    this.name = 'NotFoundError'
  }
}

export class RlsError extends DbError {
  constructor(operation: string, table: string) {
    super('RLS_DENIED', `RLS denied ${operation} on ${table}`)
    this.name = 'RlsError'
  }
}

export function handleSupabaseError(error: { code?: string; message: string }, operation: string, table: string): never {
  if (error.code === 'PGRST116') throw new NotFoundError(table, 'query')
  if (error.code === '42501') throw new RlsError(operation, table)
  throw new DbError(error.code ?? 'DB_ERROR', `${operation} on ${table}: ${error.message}`, error)
}
