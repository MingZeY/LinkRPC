import { TestCase } from "./TestCase.js";
import path from 'path';
import fs from 'fs';
import http from 'http';
import { LinkRPCServer } from "../src/server.js";
import { LinkRPCAPIDefine, LinkRPCBuildin, LinkRPCClient, LinkRPCConnection, LinkRPCChannelPipe, LinkRPCContextSymbol, type LinkRPCContext, type LinkRPCContextAware } from "../src/index.js";

const __dirname = import.meta.dirname;

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'audio/ogg',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
};

const CACHEABLE_EXTENSIONS = new Set([
    '.css', '.js', '.mjs',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
    '.mp3', '.mp4', '.webm', '.ogg',
    '.pdf',
]);

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}

function isCacheable(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return CACHEABLE_EXTENSIONS.has(ext);
}

interface FileMeta {
    exists: boolean;
    mimeType?: string;
    size?: number;
    etag?: string;
    cacheable?: boolean;
}

interface FileServiceInterface{
    stat(uri:string):Promise<FileMeta>;
    request(uri:string):Promise<boolean>;
}

const ServerDefine = new LinkRPCAPIDefine<{
    file:FileServiceInterface
}>();

class FileService implements FileServiceInterface,LinkRPCContextAware{

    private basePath:string;
    [LinkRPCContextSymbol]: LinkRPCContext | undefined;

    constructor(){
        this.basePath = path.join(__dirname, './file');
    }


    private responseFile(filePath:string):boolean{
        const context = this[LinkRPCContextSymbol];
        if(!context){
            return false;
        }
        const request = context.request;
        if(!request){
            return false;
        }
        const stream = request.stream;
        if(!stream){
            return false;
        }
        const connection = context.connection;
        const pipe = new LinkRPCChannelPipe(connection, stream.channel);
        const readStream = fs.createReadStream(filePath);
        readStream.on('close',() => {
            pipe.destroy();
        })
        readStream.pipe(pipe);
        return true;
    }
    
    @LinkRPCAPIDefine.method()
    async stat(name:string):Promise<FileMeta>{
        const filepath = path.join(this.basePath,name);
        if(!fs.existsSync(filepath)){
            return {exists:false};
        }
        const stat = fs.statSync(filepath);
        const etag = `"${stat.mtimeMs.toString(16)}-${stat.size.toString(16)}"`;
        return {
            exists:true,
            mimeType:getMimeType(name),
            size:stat.size,
            etag,
            cacheable:isCacheable(name),
        };
    }

    @LinkRPCAPIDefine.method()
    async request(name:string):Promise<boolean>{
        const filepath = path.join(this.basePath,name);
        if(!fs.existsSync(filepath)){
            return false;
        }
        return this.responseFile(filepath);
    }
}

export default class TestFileProxy extends TestCase{
    private server?: LinkRPCServer<typeof ServerDefine,any>;
    private proxy?: http.Server;
    private connection?: LinkRPCConnection;

    name(): string {
        return 'FileProxy';
    }


    async run(): Promise<boolean> {

        this.server = new LinkRPCServer({
            local:ServerDefine,
            provider:new LinkRPCBuildin.provider.Socket(),
        })
        this.server.hookService('file',new FileService());
        this.server.hub.emitter.on('error',(e) => {
            console.log(e);
        })

        await this.server.listen({
            port:3060,
        })

        this.proxy = new http.Server();
        const client = new LinkRPCClient({
            remote:ServerDefine,
            provider:new LinkRPCBuildin.provider.Socket()
        })
        this.connection = await client.connect({port:3060});
        const api = client.getInterface(this.connection);

        this.proxy.addListener('request',async (req,res) => {
            if(!req.url?.startsWith('/file/')){
                res.end('404 Not Found');
                return;
            }
            const uri = req.url?.substring('/file/'.length);
            if(!uri){
                res.end('404 Not Found');
                return;
            }

            const meta = await api.file.stat(uri).catch((e) => {
                console.log(e);
                return undefined;
            });
            if(!meta || !meta.exists){
                res.end('404 Not Found');
                return;
            }

            if(meta.mimeType){
                res.setHeader('Content-Type', meta.mimeType);
            }

            if(meta.cacheable && meta.etag){
                const ifNoneMatch = req.headers['if-none-match'];
                if(ifNoneMatch === meta.etag){
                    res.writeHead(304);
                    res.end();
                    return;
                }
                res.setHeader('ETag', meta.etag);
                res.setHeader('Cache-Control', 'public, max-age=3600');
            }

            if(meta.size){
                res.setHeader('Content-Length', meta.size);
            }

            // 开始请求文件
            let pipe:LinkRPCChannelPipe | undefined;
            const result = await api.request({
                service:'file',
                method:'request',
                args:[uri],
            },{
                stream:(remotePipe) => {
                    pipe = remotePipe;
                },
            })
            if(!result){
                pipe?.destroy();
            }
            if(!pipe){
                res.statusCode = 404;
                res.end('404 Not Found');
                return;
            }
            pipe.on('error',() => {
                res.statusCode = 500;
                res.end();
            })
            res.on('finish',() => {
                pipe?.destroy();
            })
            pipe.pipe(res);
        })

        this.proxy.listen(3061);

        const localFile = fs.readFileSync(path.join(__dirname, 'file', '100px.jpg'));

        const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
            const req = http.get('http://localhost:3061/file/100px.jpg', resolve);
            req.on('error', reject);
        });

        await this.asert({
            handler: () => response.statusCode === 200,
            desc: `HTTP status should be 200, got ${response.statusCode}`,
        });

        await this.asert({
            handler: () => response.headers['content-type'] === 'image/jpeg',
            desc: `Content-Type should be image/jpeg, got ${response.headers['content-type']}`,
        });

        const body = await new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        });

        await this.asert({
            handler: () => body.equals(localFile),
            desc: 'HTTP response body should match local 100px.jpg',
        });

        return true;
    }

    public async finally(): Promise<void> {
        if (this.proxy) {
            this.proxy.closeAllConnections();
            await new Promise<void>((resolve) => this.proxy!.close(() => resolve()));
        }
        if (this.connection) {
            await this.connection.close();
        }
        if (this.server) {
            await this.server.close();
        }
    }
    
}