export interface Env {
  PICOS_STORE_BUCKET: R2Bucket;
  PICOS_STORE_KV: KVNamespace;
  GITHUB_TOKEN?: string;
  REFRESH_TOKEN?: string;
}
