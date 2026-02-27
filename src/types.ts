export interface LockoClientOptions {
  apiKey: string;
  apiUrl: string;
}

export interface LockoVariable {
  key: string;
  value: string;
}

export type LockoVariableMap = Record<string, string>;
