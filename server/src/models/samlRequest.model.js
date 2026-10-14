import mongoose from 'mongoose';

// Outstanding SAML AuthnRequest IDs, so a response is only accepted for a login this server started
// (and only once). Shared in MongoDB rather than memory so several API instances agree.
const samlRequestSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }
});
samlRequestSchema.tenantExempt = true; // keyed by globally unique request IDs

export const SamlRequest = mongoose.model('SamlRequest', samlRequestSchema);

// Cache provider in the shape @node-saml/node-saml expects
export const samlRequestCache = (ttlMs) => ({
  saveAsync: async (key, value) => {
    await SamlRequest.updateOne({ key }, { value, expiresAt: new Date(Date.now() + ttlMs) }, { upsert: true });
    return { createdAt: Date.now(), value };
  },
  getAsync: async (key) => (await SamlRequest.findOne({ key, expiresAt: { $gt: new Date() } }))?.value ?? null,
  removeAsync: async (key) => {
    const gone = await SamlRequest.findOneAndDelete({ key });
    return gone ? key : null;
  }
});
