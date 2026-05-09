import type { LinkRPCAPIDefine, LinkRPCAPIDefineType } from "./define.js";

type LinkRPCInterfaceTarget<D extends LinkRPCAPIDefine<LinkRPCAPIDefineType>> = D extends LinkRPCAPIDefine<infer U> ? {
    [S in keyof U & string]:{
        [M in keyof U[S] & string]: {
            service: S;
            method: M;
            args: Parameters<U[S][M]>;
            descriptor?: {
                Function: U[S][M]
                Parameters: Parameters<U[S][M]>
                ReturnType: ReturnType<U[S][M]>
            }
        }
    }[keyof U[S] & string]
}[keyof U & string] : never;


type LinkRPCInterfaceConfig = {

}

type LinkRPCInterfaceHandler<D extends LinkRPCAPIDefine<LinkRPCAPIDefineType>,C extends LinkRPCInterfaceConfig> = (target:LinkRPCInterfaceTarget<D>,config?:C | undefined) => Promise<any>;

class LinkRPCInterfaceBase<D extends LinkRPCAPIDefine<LinkRPCAPIDefineType>,C extends LinkRPCInterfaceConfig> {
    // protected define: D;
    public handler: LinkRPCInterfaceHandler<D,C>;

    constructor(handler: LinkRPCInterfaceHandler<D,C>,defultConfig?:C | undefined) {
        // this.define = define;
        this.handler = handler;

        // 使用 Proxy 层级拦截
        return new Proxy(this, {
            get(target, prop: string) {
                // 如果访问的是类本身已有的属性（如 define, handler），直接返回
                if (prop in target) {
                    return Reflect.get(target, prop);
                }
                const serviceName = prop;
                // 否则，进入第一层 Proxy：Service 层
                return new Proxy({}, {
                    get(_, methodName: string) {
                        // 进入第二层 Proxy：Method 层，返回实际的执行函数
                        return Object.assign(async (...args:any[]) => {
                            return await handler({
                                service:serviceName,
                                method:methodName,
                                args,
                            } as LinkRPCInterfaceTarget<D>,defultConfig);
                        },{
                            async request(args:any[],config:C){
                                return await handler({
                                    service:serviceName,
                                    method:methodName,
                                    args,
                                } as LinkRPCInterfaceTarget<D>,Object.assign({},defultConfig,config));
                            }
                        })
                    }
                });
            }
        }) as any;
    }

}

type LinkRPCInterfacePromisify<T> = 
T extends (...args: infer P) => Promise<infer R> ?
    (...args: P) => Promise<R>
: T extends (...args: infer P) => infer R ?
    (...args: P) => Promise<R>
: never;

type LinkRPCInterfaceProxy<D extends LinkRPCAPIDefine<LinkRPCAPIDefineType>,C extends LinkRPCInterfaceConfig> = D extends LinkRPCAPIDefine<infer U> ?
    {
        [S in keyof U]: {
            [M in keyof U[S]]: LinkRPCInterfacePromisify<U[S][M]> extends (...args: infer P) => infer R ? {
                (...args:P):R;
                request:(args:P,config?:C) => R;
            } : never
        }
    }
    : never;



const LinkRPCInterface = LinkRPCInterfaceBase as (new <
    D extends LinkRPCAPIDefine<LinkRPCAPIDefineType>,
    C extends LinkRPCInterfaceConfig = LinkRPCInterfaceConfig,
>(
    handler: LinkRPCInterfaceHandler<D,C>,
    defultConfig?:C,
) => LinkRPCInterfaceBase<D,C> & LinkRPCInterfaceProxy<D,C>);

export {
    LinkRPCInterface
}