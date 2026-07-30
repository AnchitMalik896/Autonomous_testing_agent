/**
 * THE ONE APP-SPECIFIC SEAM — NOT WIRED YET.
 * spec-author fills this during the first Tester Claude session, from impl-audit
 * evidence (the app's real signup/login surfaces). Until then every fixture that
 * needs a user fails loudly here instead of producing misleading test failures.
 * All state via the real app (DB-2); the DB credential stays read-only.
 */
import type { APIRequestContext } from '@playwright/test';

export interface Credentials {
  email: string;
  password: string;
}

export interface AppAdapter {
  /** Create a user through the app's real signup surface; return its id. */
  signup(api: APIRequestContext, creds: Credentials): Promise<{ id: string }>;
  /** Authenticate `api`'s context (session cookie lands in its storage state). */
  login(api: APIRequestContext, creds: Credentials): Promise<void>;
}

class UnwiredAdapter implements AppAdapter {
  private die(): never {
    throw new Error(
      'fixtures/adapter.ts is not wired to this app yet — run a Tester Claude session ' +
      '(spec-author fills it from impl-audit evidence: real signup/login endpoints).',
    );
  }
  async signup(): Promise<{ id: string }> {
    this.die();
  }
  async login(): Promise<void> {
    this.die();
  }
}

export const adapter: AppAdapter = new UnwiredAdapter();
