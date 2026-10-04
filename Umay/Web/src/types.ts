export type User = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  theme?: string;
  language?: string;
  avatar_url?: string | null;
  is_active?: boolean;
  is_email_verified?: boolean;
  last_login_at?: string | null;
  created_at?: string;
};

export type UserUpdate = {
  full_name?: string;
  theme?: string;
  language?: string;
  avatar_url?: string | null;
};

export type UserProviderConfig = {
  id: number;
  user_id: number;
  name: string;
  server_url: string | null;
  api_key: string | null;
  model_id: string | null;
  /** Provider'dan otomatik çekilen tüm modeller (model_id -> { model_id, name, metadata? }) */
  auto_fetched_models?: Record<string, { model_id: string; name?: string; metadata?: Record<string, unknown> } | undefined> | null;
  /** Aktif (listeye eklenmiş) modeller */
  active_models?: string[] | null;
  /** model_id -> rol(ajan) listesi (chat/search/memory) */
  model_roles?: Record<string, string[]> | null;
  is_active: boolean;
};

export type ProviderCatalogEntry = {
  id: number | null;
  key: string | null;
  name: string;
  base_url: string | null;
  manual: boolean;
};

export type MemoryRecord = {
  id: number;
  user_id: number;
  scope: string;
  conversation_id: number | null;
  session_key: string | null;
  category: string;
  content: string;
  importance: number;
  source: string;
  confidence: number;
  is_active: boolean;
  created_at: string;
};

export type Conversation = {
  id: number;
  title: string | null;
  session_key: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

export type Message = {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tokens_used: number | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export type Citation = {
  source_type: string;
  source_id: number;
  title: string;
  url?: string | null;
  score?: number | null;
};

export type ChatResponse = {
  message: Message;
  memory_used: boolean;
  provider: string | null;
  citations: Citation[];
};

export type ActiveModel = {
  id: string;
  source: string;
  provider_id: number;
  provider_name: string;
  provider_key: string;
  base_url: string | null;
  model_id: string;
  name: string;
  context_length: number | null;
  max_output: number | null;
  input_cost: number | null;
  output_cost: number | null;
  modality: string | null;
  roles: string[];
};

export type DataEntry = {
  id: number;
  source_id: number;
  source_name: string;
  title: string;
  content: string;
  url: string | null;
  image_url: string | null;
  language: string | null;
  category: string | null;
  published_at: string | null;
  fetched_at: string;
  accuracy_percent: number;
  is_active: boolean;
};

export type DataEntriesResponse = {
  items: DataEntry[];
  total: number;
  skip: number;
  limit: number;
};

export type Reminder = {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  remind_at: string;
  repeat: string;
  status: string;
  channel: string;
  triggered_at: string | null;
};

export type AgentDevice = {
  id: number;
  device_uid: string;
  name: string;
  platform: string;
  arch: string;
  protocol_version: string;
  capabilities: Record<string, unknown> | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RuntimeAvailability = {
  package: string;
  command: string;
  available: boolean;
  reason: string | null;
};

export type DevicePairing = {
  pairing_id: string;
  code: string;
  expires_at: string;
};

export type PluginCatalogItem = {
  id: number;
  plugin_id: string;
  version: string;
  name: string;
  description: string | null;
  category: string;
  min_bridge_protocol: string;
  platforms: Record<string, unknown>[];
  manifest: Record<string, unknown>;
  checksum: string | null;
  signature: string | null;
  license_ref: string | null;
  default_port: number | null;
  port_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PluginInstallation = {
  id: number;
  installation_id: string;
  device_id: number;
  plugin_id: string;
  version: string;
  install_status: string;
  runtime_status: string;
  bind_address: string;
  port: number | null;
  installed_path: string | null;
  data_dir: string | null;
  config: Record<string, unknown> | null;
  last_error: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PluginOperationResult = {
  operation_id: string;
  command_id: string;
  installation_id: string | null;
  status: string;
};

export type PluginLog = {
  id: number;
  installation_id: number;
  operation_id: number | null;
  level: string;
  message: string;
  created_at: string;
};
