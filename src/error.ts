class LinkRPCError extends Error {

    public code?: number | undefined;

    constructor(message: string, code?: number) {
        super(message);
        this.code = code;
    }

}

export {
    LinkRPCError
}