export async function supabaseFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('labflow-auth-token');
  const supabaseToken = JSON.parse(localStorage.getItem('labflow-supabase-session') || 'null')?.access_token;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (supabaseToken) headers['x-supabase-token'] = supabaseToken;
  
  const response = await fetch(`/api${url}`, {
    ...options,
    headers: { ...headers, ...options?.headers as Record<string, string> }
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message);
  }
  
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function supabaseGet<T>(url: string): Promise<T> {
  return supabaseFetch<T>(url, { method: 'GET' });
}

export async function supabasePost<T>(url: string, data?: unknown): Promise<T> {
  return supabaseFetch<T>(url, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function supabasePut<T>(url: string, data?: unknown): Promise<T> {
  return supabaseFetch<T>(url, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function supabaseDelete<T>(url: string): Promise<T> {
  return supabaseFetch<T>(url, { method: 'DELETE' });
}
