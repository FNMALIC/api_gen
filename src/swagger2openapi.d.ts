declare module 'swagger2openapi' {
    interface ConvertResult {
        openapi: unknown;
    }
    const converter: {
        convertObj(spec: unknown, options: { patch?: boolean; warnOnly?: boolean }): Promise<ConvertResult>;
    };
    export default converter;
}
