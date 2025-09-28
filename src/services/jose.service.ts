// src/services/jose.service.ts
// ESM-safe loader for 'jose' with JWKS caching for Apple Sign In.
// Works under CommonJS/ts-node because we force a real dynamic import via eval().

export class JoseService {
  // Cache the loaded module across calls (type intentionally 'any' to avoid TS emitting helpers)
  private static joseModulePromise: Promise<any> | null = null;

  // Cache Apple's JWKS across calls (keep 'any' to stay runtime-only)
  private static appleJWKS: any | null = null;

  /** Lazily load the ESM-only 'jose' module in CJS projects */
  private static loadJose(): Promise<any> {
    if (!this.joseModulePromise) {
      // IMPORTANT: using eval keeps TS from rewriting import() into require()
      this.joseModulePromise = (0, eval)('import("jose")') as Promise<any>;
      // Alternative (equivalent):
      // const dynamicImport = new Function('s', 'return import(s)');
      // this.joseModulePromise = dynamicImport('jose') as Promise<any>;
    }
    return this.joseModulePromise;
  }

  /** Return a cached RemoteJWKSet for Apple's keys */
  static async getAppleJWKS() {
    if (this.appleJWKS) return this.appleJWKS;
    const { createRemoteJWKSet } = await this.loadJose();
    this.appleJWKS = createRemoteJWKSet(
      new URL('https://appleid.apple.com/auth/keys')
    );
    return this.appleJWKS;
  }

  /**
   * Verify an Apple ID token and return jose's verify result.
   * - Checks signature against Apple JWKS
   * - Validates issuer and audience (aud must be your iOS bundle id)
   */
  static async verifyAppleIdToken(idToken: string, audience: string) {
    const { jwtVerify } = await this.loadJose();
    const jwks = await this.getAppleJWKS();
    return jwtVerify(idToken, jwks, {
      issuer: 'https://appleid.apple.com',
      audience,
    });
  }

  /** (Optional) Clear caches – handy for tests or hot-reloads */
  static _resetForTests() {
    this.joseModulePromise = null;
    this.appleJWKS = null;
  }
}
