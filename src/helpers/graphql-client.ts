import getConnectionInfo from './get-connection-info'

export async function graphqlRequest<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const {url, authToken} = getConnectionInfo()

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({query, variables}),
  })

  if (!response.ok) {
    throw new Error(`GraphQL request failed with status ${response.status}`)
  }

  const json = await response.json() as {data?: T; errors?: Array<{message: string}>}

  if (json.errors?.length) {
    throw new Error(json.errors.map(e => e.message).join('\n'))
  }

  return json.data as T
}
