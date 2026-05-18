import { DataProvider, fetchUtils } from 'react-admin'

const BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8081/api'

const API_URLS: Record<string, string> = {
  'spark-jobs':           BASE_URL,
  'spark-job-executions': BASE_URL,
  'spark-metrics':        BASE_URL,
  'spark-schedules':      BASE_URL,
  'spark-alerts':         BASE_URL,
}

const httpClient = (url: string, options: fetchUtils.Options = {}) => {
  const token = localStorage.getItem('token')
  const headers = new Headers({ Accept: 'application/json' })
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetchUtils.fetchJson(url, { ...options, headers })
}

const getBaseUrl = (resource: string): string => {
  const base = API_URLS[resource]
  if (!base) throw new Error(`Nessun endpoint configurato per: ${resource}`)
  return `${base}/${resource}`
}

const dataProvider: DataProvider = {
  getList: async (resource, params) => {
    const page    = params.pagination?.page    ?? 1
    const perPage = params.pagination?.perPage ?? 20
    const field   = params.sort?.field         ?? 'id'
    const order   = params.sort?.order         ?? 'DESC'

    const query = new URLSearchParams({
      page:  String(page - 1),
      size:  String(perPage),
      sort:  field,
      order: order.toLowerCase(),
    })

    if (params.filter) {
      Object.entries(params.filter).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') query.set(k, String(v))
      })
    }

    const { headers, json } = await httpClient(`${getBaseUrl(resource)}?${query}`)
    return {
      data:  json,
      total: parseInt(
        headers.get('x-total-count') || headers.get('X-Total-Count') || '0',
        10
      ),
    }
  },

  getOne: async (resource, params) => {
    const { json } = await httpClient(`${getBaseUrl(resource)}/${params.id}`)
    return { data: json }
  },

  getMany: async (resource, params) => {
    const results = await Promise.all(
      params.ids.map(id => httpClient(`${getBaseUrl(resource)}/${id}`))
    )
    return { data: results.map(r => r.json) }
  },

  getManyReference: async (resource, params) => {
    const page    = params.pagination?.page    ?? 1
    const perPage = params.pagination?.perPage ?? 20
    const field   = params.sort?.field         ?? 'id'
    const order   = params.sort?.order         ?? 'DESC'

    const query = new URLSearchParams({
      page:  String(page - 1),
      size:  String(perPage),
      sort:  field,
      order: order.toLowerCase(),
      [params.target]: String(params.id),
    })

    const { headers, json } = await httpClient(`${getBaseUrl(resource)}?${query}`)
    return {
      data:  json,
      total: parseInt(
        headers.get('x-total-count') || headers.get('X-Total-Count') || '0',
        10
      ),
    }
  },

  create: async (resource, params) => {
    const { json } = await httpClient(getBaseUrl(resource), {
      method: 'POST',
      body:   JSON.stringify(params.data),
    })
    return { data: json }
  },

  update: async (resource, params) => {
    const { json } = await httpClient(`${getBaseUrl(resource)}/${params.id}`, {
      method: 'PUT',
      body:   JSON.stringify(params.data),
    })
    return { data: json }
  },

  updateMany: async (resource, params) => {
    await Promise.all(
      params.ids.map(id =>
        httpClient(`${getBaseUrl(resource)}/${id}`, {
          method: 'PUT',
          body:   JSON.stringify(params.data),
        })
      )
    )
    return { data: params.ids }
  },

  delete: async (resource, params) => {
    await httpClient(`${getBaseUrl(resource)}/${params.id}`, { method: 'DELETE' })
    return { data: params.previousData as any }
  },

  deleteMany: async (resource, params) => {
    await Promise.all(
      params.ids.map(id =>
        httpClient(`${getBaseUrl(resource)}/${id}`, { method: 'DELETE' })
      )
    )
    return { data: params.ids }
  },
}

export default dataProvider
