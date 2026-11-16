/** The part of a Supabase query result the data hooks use. */
export type QueryResult = { data: unknown; error: { message: string } | null };
