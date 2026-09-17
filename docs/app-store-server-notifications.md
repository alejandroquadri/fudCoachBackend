# App Store Server Notifications V2

The backend receives verified App Store Server Notifications at:

```text
https://api.fud.coach/iap/app-store-notifications
```

Configure this exact HTTPS URL as the Version 2 notification URL for both the
Production and Sandbox environments in App Store Connect. Apple posts a JSON
body with a `signedPayload`; the endpoint verifies its JWS signature before it
writes anything to the database.

The endpoint updates these MongoDB collections:

- `iapSubscriptionLineages`: one immutable ownership mapping per original
  transaction ID.
- `iapTransactions`: one record per App Store transaction ID.
- `iapNotifications`: one record per App Store notification UUID, used for
  audit and idempotency.

The user entitlement is then refreshed from App Store Server API's current
subscription status. Notification payload status alone is not treated as the
authoritative source of access.

## Verification after deployment

1. Deploy the backend before configuring the URL.
2. In App Store Connect, enable Version 2 notifications for both environments
   using the URL above.
3. Use App Store Connect's server-notification test facility, or complete a
   Sandbox purchase or renewal.
4. Confirm that the notification endpoint returns HTTP 200 and an
   `iapNotifications` record has `outcome: "processed"`.
5. Confirm that a matching lineage and transaction record exist, and that the
   user's entitlement reflects the current App Store status.

Apple cannot post directly to a Mac on the local network. For local-only
testing, use an HTTPS tunnel with a stable public URL and configure that tunnel
temporarily in App Store Connect; do not point the production configuration at
a development machine.
