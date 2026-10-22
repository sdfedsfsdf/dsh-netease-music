/** Convert the small author-facing parameter DSL to registry-ready JSON Schema.
 * ctx.tools.register accepts JSON Schema, not defineTool's parameter-map DSL.
 * Kept dependency-free so desktop profiles need not install optional host peers.
 */
export function parameterSchema(parameters = {}) {
  const convert = (spec) => {
    const { required: _required, ...node } = spec
    if (node.type === 'array') node.items = convert(node.items)
    if (node.type === 'object') {
      const nested = parameterSchema(node.properties || {})
      node.properties = nested.properties
      node.required = nested.required
      node.additionalProperties = node.additionalProperties ?? false
    }
    return node
  }
  return {
    type: 'object',
    properties: Object.fromEntries(Object.entries(parameters).map(([key, spec]) => [key, convert(spec)])),
    required: Object.entries(parameters).filter(([, spec]) => spec.required === true).map(([key]) => key),
    additionalProperties: false,
  }
}
