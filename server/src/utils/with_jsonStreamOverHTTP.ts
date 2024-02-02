import { serializeErrorToJSON } from './errors'
import { setup_with_jsonStreamOverHTTP } from '../lib_jsonStreamOverHTTP/with_jsonStreamOverHTTP'

export const with_jsonStreamOverHTTP = setup_with_jsonStreamOverHTTP(err => ({
  type: 'NETWORK_ERROR',
  data: serializeErrorToJSON(err),
}))
