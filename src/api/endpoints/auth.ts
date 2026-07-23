import { apiInvoke } from "../client";

export async function checkAuth(): Promise<boolean> {
  return apiInvoke("check_auth");
}

export async function setApiKey(key: string): Promise<void> {
  return apiInvoke("set_api_key", { key });
}

export async function testConnection(): Promise<string> {
  return apiInvoke("test_connection");
}

export async function getBalance(): Promise<string> {
  return apiInvoke("get_balance");
}
