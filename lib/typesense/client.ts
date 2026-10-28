import "server-only";
import { Client } from "typesense";
import { typesenseConfig } from "./config";

export function createTypesenseSearchClient() {
  const config = typesenseConfig();
  return { collection: config.collection, client: new Client({
    nodes: [{ host: config.host, port: config.port, protocol: config.protocol }],
    apiKey: config.key, connectionTimeoutSeconds: 2, timeoutSeconds: 2,
    numRetries: 0, logLevel: "silent", sendApiKeyAsQueryParam: false,
  }) };
}
