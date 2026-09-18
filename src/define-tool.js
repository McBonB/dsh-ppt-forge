/**
 * Local `defineTool` — builds a registry-ready tool definition.
 *
 * The host's `ctx.tools.register()` accepts raw JSON-Schema tool definitions
 * directly (the same path MCP-sourced tools take): it requires
 * `output: { schema, render }` with a supported JSON Schema, stores the
 * definition verbatim, and validates model-supplied arguments against
 * `parameters` at dispatch. Depending on `@deepseek-ai/dsh-tools` for the
 * one-line wrapper is not viable for a third-party plugin: its published
 * build carries a large peer closure that pnpm tries to auto-install, which
 * hits packages the registry does not carry. This factory therefore compiles
 * the same parameter-spec vocabulary this plugin uses (typed properties with
 * `required` and `description`) into the JSON Schema subset the pipeline
 * enforces, and passes the definition through unchanged otherwise.
 */

/**
 * @typedef {object} ParameterSpec
 * @property {'string'|'boolean'|'number'|'integer'|'array'} type
 * @property {boolean} [required]
 * @property {string} [description]
 * @property {{ type: string }} [items]
 */

/**
 * @typedef {object} ToolOptions
 * @property {string} name
 * @property {string} description
 * @property {Record<string, ParameterSpec>} parameters
 * @property {{ schema: object, render: (args: unknown, value: unknown) => Array<{type: string, text?: string}> }} output
 * @property {(args: Record<string, unknown>, exec: import('./types.js').ToolRunContext) => Promise<Record<string, unknown>>} execute
 */

/**
 * @param {Record<string, ParameterSpec>} spec
 * @returns {{ type: 'object', properties: Record<string, object>, required: string[] }}
 */
export function parameterSpecToJsonSchema(spec) {
  /** @type {Record<string, object>} */
  const properties = {};
  /** @type {string[]} */
  const required = [];
  for (const [key, entry] of Object.entries(spec)) {
    /** @type {Record<string, unknown>} */
    const property = { type: entry.type };
    if (entry.description !== undefined) property.description = entry.description;
    if (entry.type === 'array' && entry.items !== undefined) property.items = { type: entry.items.type };
    properties[key] = property;
    if (entry.required === true) required.push(key);
  }
  return { type: 'object', properties, required };
}

/**
 * @param {ToolOptions} options
 */
export function defineTool(options) {
  return {
    name: options.name,
    description: options.description,
    parameters: parameterSpecToJsonSchema(options.parameters),
    output: {
      schema: options.output.schema,
      render: options.output.render,
    },
    execute: options.execute,
  };
}
