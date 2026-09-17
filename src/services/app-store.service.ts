import {
  APIError,
  APIException,
  AppStoreServerAPIClient,
  Environment,
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
  ResponseBodyV2DecodedPayload,
  SignedDataVerifier,
  Status,
} from '@apple/app-store-server-library';
import { promises as fs } from 'fs';
import * as path from 'path';

export class AppStoreService {
  private issuerId = process.env.APPSTORE_ISSUER_ID!;
  private keyId = process.env.APPSTORE_KEY_ID!;
  private bundleId = process.env.APP_BUNDLE_ID!;
  private appAppleId = Number(process.env.APP_APPLE_ID);

  private certsDir = path.join(process.cwd(), 'certs');
  private privateKeyFile = path.join(
    process.cwd(),
    'secrets',
    'appstore_private_key.p8'
  );

  private prodClient!: AppStoreServerAPIClient;
  private sandboxClient!: AppStoreServerAPIClient;
  private prodVerifier!: SignedDataVerifier;
  private sandboxVerifier!: SignedDataVerifier;

  private initPromise?: Promise<void>;

  constructor() {
    // ✅ Keep only the essentials here (no PEM check here)
    if (
      !this.issuerId ||
      !this.keyId ||
      !this.bundleId ||
      !Number.isInteger(this.appAppleId) ||
      this.appAppleId <= 0
    ) {
      throw new Error(
        'Missing App Store credentials (issuerId/keyId/bundleId/appAppleId)'
      );
    }
    // (Optional) debug
    console.log('[AppStoreService] certsDir:', this.certsDir);
    console.log('[AppStoreService] p8 path:', this.privateKeyFile);
  }

  // One-time lazy initializer: reads PEM file, builds clients & verifiers
  private async ensureVerifiers() {
    // If already initialized, exit fast
    if (
      this.prodVerifier &&
      this.sandboxVerifier &&
      this.prodClient &&
      this.sandboxClient
    )
      return; // NEW

    // If another request is already initializing, wait for it
    if (this.initPromise) return this.initPromise; // NEW

    // Start initialization and cache the promise so concurrent callers await it
    this.initPromise = (async () => {
      // NEW
      // 1) Load PEM from disk (no env fallback since you chose file only)
      let pem: string;
      try {
        pem = await fs.readFile(this.privateKeyFile, 'utf8'); // NEW
      } catch (e) {
        throw new Error(
          `Cannot read App Store private key file at ${this.privateKeyFile}. ` +
            `Mount or COPY the file, or update the path.`
        ); // NEW
      }
      if (!pem.includes('BEGIN PRIVATE KEY')) {
        throw new Error(
          'Invalid .p8 file contents: missing BEGIN PRIVATE KEY header.'
        ); // NEW
      }

      // 2) Create API clients now that we have the PEM
      this.prodClient = new AppStoreServerAPIClient(
        pem,
        this.keyId,
        this.issuerId,
        this.bundleId,
        Environment.PRODUCTION
      ); // NEW
      this.sandboxClient = new AppStoreServerAPIClient(
        pem,
        this.keyId,
        this.issuerId,
        this.bundleId,
        Environment.SANDBOX
      ); // NEW

      // 3) Load Apple root certs (DER .cer)
      const loadCert = async (file: string) =>
        fs.readFile(path.join(this.certsDir, file)); // unchanged

      const appleRoots = [
        await loadCert('AppleRootCA-G2.cer'),
        await loadCert('AppleRootCA-G3.cer'),
      ];

      // 4) Build verifiers (keep OCSP/CRL off while wiring up)
      const enableOnlineChecks = false;
      this.prodVerifier = new SignedDataVerifier(
        appleRoots,
        enableOnlineChecks,
        Environment.PRODUCTION,
        this.bundleId,
        this.appAppleId || undefined
      );
      this.sandboxVerifier = new SignedDataVerifier(
        appleRoots,
        enableOnlineChecks,
        Environment.SANDBOX,
        this.bundleId,
        undefined
      );
    })();

    // Wait for the one-time init to complete before returning
    return this.initPromise;
  }

  /**
   * Get and verify a single transaction by its transactionId.
   * Try PRODUCTION first; if that fails, try SANDBOX.
   */
  public async getVerifiedTransactionById(transactionId: string): Promise<{
    transaction: JWSTransactionDecodedPayload;
    environment: 'PRODUCTION' | 'SANDBOX';
  }> {
    await this.ensureVerifiers();

    try {
      const prod = await this.prodClient.getTransactionInfo(transactionId);
      const tx = await this.prodVerifier.verifyAndDecodeTransaction(
        this.requireString(
          prod.signedTransactionInfo,
          'signedTransactionInfo (PRODUCTION)'
        )
      );
      return { transaction: tx, environment: 'PRODUCTION' };
    } catch (error) {
      if (!this.isTransactionNotFound(error)) throw error;
    }

    const sand = await this.sandboxClient.getTransactionInfo(transactionId);
    const tx = await this.sandboxVerifier.verifyAndDecodeTransaction(
      this.requireString(
        sand.signedTransactionInfo,
        'signedTransactionInfo (SANDBOX)'
      )
    );
    return { transaction: tx, environment: 'SANDBOX' };
  }

  private requireString(val: string | undefined, what: string): string {
    if (!val) throw new Error(`Missing ${what}`);
    return val;
  }

  public async getVerifiedSubscriptionStatus(originalTransactionId: string) {
    await this.ensureVerifiers();

    const check = async (
      client: AppStoreServerAPIClient,
      verifier: SignedDataVerifier,
      env: 'PRODUCTION' | 'SANDBOX'
    ) => {
      const res = await client.getAllSubscriptionStatuses(
        originalTransactionId
      );

      const matchingTransactions =
        res.data
          ?.flatMap(group => group.lastTransactions ?? [])
          .filter(
            item => item.originalTransactionId === originalTransactionId
          ) ?? [];
      const latest =
        matchingTransactions.find(
          item =>
            item.status === Status.ACTIVE ||
            item.status === Status.BILLING_GRACE_PERIOD
        ) ?? matchingTransactions[0];

      if (!latest?.signedTransactionInfo) {
        throw new Error('Apple returned no signed subscription transaction');
      }

      const transaction = await verifier.verifyAndDecodeTransaction(
        latest.signedTransactionInfo
      );
      const renewalInfo = latest.signedRenewalInfo
        ? await verifier.verifyAndDecodeRenewalInfo(latest.signedRenewalInfo)
        : undefined;
      const active =
        latest.status === Status.ACTIVE ||
        latest.status === Status.BILLING_GRACE_PERIOD;

      return {
        active,
        status: latest.status,
        transaction,
        renewalInfo,
        environment: env,
      };
    };

    try {
      return await check(this.prodClient, this.prodVerifier, 'PRODUCTION');
    } catch (error) {
      if (!this.isTransactionNotFound(error)) throw error;
      return check(this.sandboxClient, this.sandboxVerifier, 'SANDBOX');
    }
  }

  public async setAppAccountToken(
    originalTransactionId: string,
    appAccountToken: string,
    environment: 'PRODUCTION' | 'SANDBOX'
  ) {
    await this.ensureVerifiers();
    const client =
      environment === 'PRODUCTION' ? this.prodClient : this.sandboxClient;
    await client.setAppAccountToken(originalTransactionId, { appAccountToken });
  }

  public async getVerifiedNotification(signedPayload: string): Promise<{
    notification: ResponseBodyV2DecodedPayload;
    transaction?: JWSTransactionDecodedPayload;
    renewalInfo?: JWSRenewalInfoDecodedPayload;
    environment: 'PRODUCTION' | 'SANDBOX';
  }> {
    await this.ensureVerifiers();

    const decode = async (
      verifier: SignedDataVerifier,
      environment: 'PRODUCTION' | 'SANDBOX'
    ) => {
      const notification = await verifier.verifyAndDecodeNotification(
        signedPayload
      );
      const signedTransactionInfo = notification.data?.signedTransactionInfo;
      const signedRenewalInfo = notification.data?.signedRenewalInfo;

      return {
        notification,
        transaction: signedTransactionInfo
          ? await verifier.verifyAndDecodeTransaction(signedTransactionInfo)
          : undefined,
        renewalInfo: signedRenewalInfo
          ? await verifier.verifyAndDecodeRenewalInfo(signedRenewalInfo)
          : undefined,
        environment,
      };
    };

    try {
      return await decode(this.prodVerifier, 'PRODUCTION');
    } catch {
      return decode(this.sandboxVerifier, 'SANDBOX');
    }
  }

  private isTransactionNotFound(error: unknown) {
    return (
      error instanceof APIException &&
      (error.apiError === APIError.TRANSACTION_ID_NOT_FOUND ||
        error.apiError === APIError.ORIGINAL_TRANSACTION_ID_NOT_FOUND)
    );
  }
}
