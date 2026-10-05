import pg from 'pg';

/**
 * Development/test helpers that need an administrative connection (superuser or CREATEROLE +
 * CREATEDB). Production roles and databases are provisioned by infrastructure, never by the app.
 */
export interface RoleCredentials {
  owner: { name: string; password: string };
  runtime: { name: string; password: string };
  system: { name: string; password: string };
}

function quoteIdent(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe identifier: ${value}`);
  return `"${value}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export async function ensureRoles(adminUrl: string, roles: RoleCredentials): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    for (const role of [roles.owner, roles.runtime, roles.system]) {
      const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role.name]);
      const attributes = 'LOGIN NOSUPERUSER NOCREATEROLE NOBYPASSRLS';
      const statement = exists.rowCount
        ? `ALTER ROLE ${quoteIdent(role.name)} WITH ${attributes} PASSWORD ${quoteLiteral(role.password)}`
        : `CREATE ROLE ${quoteIdent(role.name)} WITH ${attributes} PASSWORD ${quoteLiteral(role.password)}`;
      await client.query(statement);
    }
  } finally {
    await client.end();
  }
}

export async function recreateDatabase(
  adminUrl: string,
  database: string,
  owner: string,
  grantConnectTo: string[],
): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [database],
    );
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(database)}`);
    await client.query(`CREATE DATABASE ${quoteIdent(database)} OWNER ${quoteIdent(owner)}`);
    await client.query(`REVOKE ALL ON DATABASE ${quoteIdent(database)} FROM PUBLIC`);
    for (const role of grantConnectTo) {
      await client.query(
        `GRANT CONNECT, TEMPORARY ON DATABASE ${quoteIdent(database)} TO ${quoteIdent(role)}`,
      );
    }
  } finally {
    await client.end();
  }
}

export async function dropDatabase(adminUrl: string, database: string): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [database],
    );
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(database)}`);
  } finally {
    await client.end();
  }
}
