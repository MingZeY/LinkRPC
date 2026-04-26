import { LinkRPCAPIDefine, LinkRPCBuildin, LinkRPCClient, LinkRPCMiddleware, LinkRPCPacketFactory, LinkRPCServer, type LinkRPCContext } from "../src/index.js";
import { TestCase } from "./TestCase.js";

class AuthMiddleware extends LinkRPCMiddleware{

    private tokenProvider = {
        service:'auth',
        method:'login'
    }

    private protectedServices = ['math'];

    private token?:string|undefined;

    async inbound(context: LinkRPCContext, next: (context: LinkRPCContext) => Promise<LinkRPCContext>): Promise<LinkRPCContext> {
        if(context.response && context.response == context.inbound){// 捕获响应
            if(context.request
            && context.request.serviceName == this.tokenProvider.service
            && context.request.methodName == this.tokenProvider.method
            ){// 确定响应对应的请求为tokenProvider
                if(context.response.result){
                    this.token = context.response.result;
                }
            }
        }
        if(context.request && context.request == context.inbound){// 捕获请求
            if(this.protectedServices.includes(context.request.serviceName)){
                // 验证token
                const token = context.request.meta?.token;
                if(!token){
                    const responsePacket = LinkRPCPacketFactory.createResponsePacket({
                        requestId:context.request.id,
                        error:'token is required',
                    })
                    // 设置响应 - 使得后续中间件可以使用该响应
                    context.response = responsePacket;
                    // 设置出站包 - 明确该包需要发送，如果仅设置 context.response，那么该包不会被发送
                    context.outbound = responsePacket;
                }else{
                    if(token != 'token123456'){
                        const responsePacket = LinkRPCPacketFactory.createResponsePacket({
                            requestId:context.request.id,
                            error:'token is invalid',
                        })
                        // 设置响应 - 使得后续中间件可以使用该响应
                        context.response = responsePacket;
                        // 设置出站包 - 明确该包需要发送，如果仅设置 context.response，那么该包不会被发送
                        context.outbound = responsePacket;
                    }
                }
            }
        }
        return next(context);
    }

    async outbound(context: LinkRPCContext, next: (context: LinkRPCContext) => Promise<LinkRPCContext>): Promise<LinkRPCContext> {
        if(context.request && context.request == context.outbound){
            if(this.token){
                if(!context.request.meta){
                    context.request.meta = {};
                }
                // 携带token发送request
                context.request.meta.token = this.token;
            }
        }
        return next(context);
    }

}

export default class TestMiddleware extends TestCase{

    name(): string {
        return "Middleware";
    }

    public async run(): Promise<boolean> {
        const define = new LinkRPCAPIDefine<{
            auth:{
                login():string,
            }
            math:{
                add(a:number,b:number):number
            }
        }>()

        const server = new LinkRPCServer({
            local:define,
            provider:new LinkRPCBuildin.provider.Memory()
        });
        server.use(new AuthMiddleware());
        server.hook('auth','login',{
            handler(){
                return 'token123456';
            }
        })
        server.hook('math','add',{
            handler(a, b) {
                return a+b;
            },
        })
        await server.listen({port:1})

        const client = new LinkRPCClient({
            remote:define,
            provider:new LinkRPCBuildin.provider.Memory()
        })
        client.use(new AuthMiddleware());
        const connection = await client.connect({port:1});
        const api = client.getAPI(connection);

        /**
         * 未登录非法请求
         */
        const illegalRequest = await api.math.add.call(1,2).then((r) => {
            return false;
        }).catch((e:Error) => {
            if(e.message.includes('token is required')){
                return true;
            }else{
                return false;
            }
        })
        this.asert({
            handler: () => illegalRequest,
        });

        /**
         * 登录后进行请求
         */
        await api.auth.login.call();
        const result = await api.math.add.call(1,2);
        this.asert({
            handler: () => result == 3,
            desc:'result should be 3',
        });
        connection.close();
        server.close();
        return true;
    }
    
}