import { LinkRPCConnection } from "../../connection.js";
import { LinkRPCPacketFactory, type LinkRPCPacket } from "../../packet.js";
import { LinkRPCProvider } from "../../provider.js";
import { dynamicimport } from "../../utils.js";

type Protocol = 'http' | 'https';

type SupportLibHTTP = typeof import('http');
type SupportLibHTTPS = typeof import('https');
type SupportLib = {
    http?: Promise<SupportLibHTTP>,
    https?: Promise<SupportLibHTTPS>,
    fetch?: Promise<typeof fetch | undefined>,
}

class LinkRPCConnectionHTTP extends LinkRPCConnection{
    
    private closed = false;

    constructor(
        private parames:{
            side:'server'|'client',
            protocol:Protocol,
            req?:any,
            res?:any,
            target?:{
                hostname?:string | undefined,
                port:number,
            },
            fetch?:typeof fetch
        }
    ){
        super();
    }

    async send(packet: LinkRPCPacket): Promise<void> {
        if(this.isClosed()){
            throw new Error('connection is closed');
        }
        if(this.parames.side == 'client'){// fetch to send
            if(!this.parames.fetch){
                throw new Error('fetch is not supported');
            }
            if(!this.parames.target){
                throw new Error('target is not provided');
            }
            const response = await this.parames.fetch(`${this.parames.protocol}://${this.parames.target.hostname || 'localhost'}:${this.parames.target.port}`, {
                method: 'POST',
                body: JSON.stringify(packet),
                headers: {
                    /** Must set linkrpc to 1 ,otherwise server will think it is a normal POST request */
                    linkrpc: '1',
                }
            }).then((res) => {
                return res.text();
            })
            const responsePacket = LinkRPCPacketFactory.parsePacketFromString(response);
            if(responsePacket){
                this.emitter.emit('receive',responsePacket);
            }
            this.close();
        }else if(this.parames.side == 'server'){// res to send
            this.parames.res.end(JSON.stringify(packet));
            this.close();
        }
    }

    async close(): Promise<void> {
        this.closed = true;
        this.emitter.emit('closed');
    }

    isClosed(): boolean {
        return this.closed;
    }
}

type LinkRPCProviderHTTPConfig = {
    lib?: SupportLib,
    server?: InstanceType<SupportLibHTTP['Server'] | SupportLibHTTPS['Server']>,
    protocol?: Protocol,
    ssl?: {
        cert: string | Buffer,
        key: string | Buffer,
    },
}

class LinkRPCProviderHTTP extends LinkRPCProvider{

    private defaultProtocol: Protocol = 'http';
    public config: LinkRPCProviderHTTPConfig;

    constructor(config?: LinkRPCProviderHTTPConfig) {
        super();
        const defaultConfig: LinkRPCProviderHTTPConfig = {
            
        }
        this.config = { ...defaultConfig, ...config };
        this.initLib();
        if(this.config.server){
            /**
             * If provide a server,will init when constructor
             * else will init when listen
             */
            this.initServer(this.config.server);
        }
    }

    private initLib() {
        if(!this.config.lib){
            this.config.lib = {};
        }
        const protocol: Protocol = this.config.protocol || this.defaultProtocol;
        if(!this.config.lib[protocol]){
            this.config.lib[protocol] = dynamicimport(protocol).catch(() => undefined);
        }
        if(!this.config.lib.fetch){
            this.config.lib.fetch = new Promise<typeof fetch | undefined>((resolve) => {
                resolve(fetch);
            }).catch((e) => {
                return undefined;
            })
        }
    }

    private initServer(server:InstanceType<SupportLibHTTP['Server'] | SupportLibHTTPS['Server']>):InstanceType<SupportLibHTTP['Server'] | SupportLibHTTPS['Server']>{

        server.on('request',(req,res) => {
            /** 
             * Request must be POST method and linkrpc=1 in headers
             * and body must be JSON string
             * and the body must be a valid packet
             * 
             * if not,ignore it
             */
            if (req.method !== 'POST'
            || req.headers['linkrpc'] !== '1'
            ) {
                return;
            }

            // receive request body,
            let body:string = '';
            req.on('data',(chunk:Buffer) => {
                body += chunk.toString();
            });

            // parse packet and validate
            req.on('end',() => {
                let packet:any;
                try{
                    packet = JSON.parse(body);
                }catch(e){
                    return;
                }
                if(!LinkRPCPacketFactory.isPacket(packet)){
                    return;
                }

                const connection = new LinkRPCConnectionHTTP({
                    side:'server',
                    protocol:this.config.protocol || this.defaultProtocol,
                    req:req,
                    res:res,
                });
                this.emitter.emit('connection',connection);
                connection.emitter.emit('receive',packet);
            })
        })

        return server;
    }

    private async createServer(): Promise<InstanceType<SupportLibHTTP['Server'] | SupportLibHTTPS['Server']>> {
        const protocol: Protocol = this.config.protocol || 'http';
        if(protocol === 'https'){
            const httpsSupport = await this.config.lib?.https;
            if(!httpsSupport){
                throw new Error("https module not found, try set config.lib.https to import('https') or install https module");
            }
            if(!this.config.ssl){
                throw new Error("HTTPS requires ssl.cert and ssl.key in config");
            }
            return httpsSupport.createServer({
                cert: this.config.ssl.cert,
                key: this.config.ssl.key,
            });
        }
        const httpSupport = await this.config.lib?.http;
        if(!httpSupport){
            throw new Error("http module not found, try set config.lib.http to import('http') or install http module");
        }
        return httpSupport.createServer();
    }

    async listen(params: { hostname?: string; port: number; }): Promise<void> {
        return new Promise<void>(async (resolve) => {
            if(!this.config.server){
                this.config.server = await this.createServer()
                this.initServer(this.config.server);
            }
            this.config.server.listen({
                port: params.port,
                host: params.hostname,
            }, () => {
                resolve();
            });
        })
    }

    async close(): Promise<void> {
        return new Promise<void>((resolve) => {
            if(!this.config.server){
                throw new Error("close requires server");
            }
            this.config.server.close((e) => {
                if(e){
                    throw e;
                }
                resolve();
            })
        })
    }

    async connect(params?: { hostname?: string; port?: number; }): Promise<LinkRPCConnection> {
        if(!params || !params.port){
            throw new Error("connect requires port");
        }
        const fetchSupport = await this.config.lib?.fetch?.catch((e) => {
            throw e;
        });
        if(!fetchSupport){
            throw new Error("fetch module not found, try set config.lib.fetch to import('fetch') or install fetch module");
        }
        const connection = new LinkRPCConnectionHTTP({
            side:'client',
            protocol:this.config.protocol || this.defaultProtocol,
            target:{
                hostname:params.hostname,
                port:params.port
            },
            fetch:fetchSupport,
        })
        return connection;
    }
    
}

export {
    LinkRPCProviderHTTP
}