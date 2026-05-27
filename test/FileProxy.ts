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
    request(channel:string,uri:string):Promise<boolean>;
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

    private getContextConnection(){
        const context = this[LinkRPCContextSymbol];
        if(!context){
            return undefined;
        }
        return context.connection;
    }

    private responseFile(connection:LinkRPCConnection,channel:string,filePath:string){
        console.log('send file by channel:',channel,filePath);
        const pipe = new LinkRPCChannelPipe(connection, channel);
        fs.createReadStream(filePath).pipe(pipe);
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
    async request(channel:string,name:string):Promise<boolean>{
        console.log('recive',channel,name);
        const filepath = path.join(this.basePath,name);
        if(!fs.existsSync(filepath)){
            return false;
        }
        const connection = this.getContextConnection();
        if(!connection){
            return false;
        }
        this.responseFile(connection,channel,filepath);
        return true;
    }
}

export default class TestFileProxy extends TestCase{
    name(): string {
        return 'FileProxy';
    }


    async run(): Promise<boolean> {
        console.log()

        const server = new LinkRPCServer({
            local:ServerDefine,
            provider:new LinkRPCBuildin.provider.Websocket(),
        })
        server.hookService('file',new FileService());
        server.hub.emitter.on('error',(e) => {
            console.log(e);
        })

        await server.listen({
            port:3060,
        })

        const proxy = new http.Server();
        const client = new LinkRPCClient({
            remote:ServerDefine,
            provider:new LinkRPCBuildin.provider.Websocket()
        })
        const connectionToServer = await client.connect({port:3060});
        const api = client.getInterface(connectionToServer);

        proxy.addListener('request',async (req,res) => {
            console.log(req.url);
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

            const channelName = `file-${Date.now()}`;
            const pipe = new LinkRPCChannelPipe(connectionToServer, channelName);

            const timeout = setTimeout(() => {
                pipe.destroy(new Error('File transfer timeout'));
            }, 30 * 1000);
            pipe.once('close', () => clearTimeout(timeout));
            pipe.on('error', () => {
                if (!res.headersSent) {
                    res.statusCode = 500;
                    res.end();
                }
            });

            pipe.pipe(res);

            const result = await api.file.request(channelName, uri).catch((e) => {
                console.log(e);
                return false;
            });

            if (!result) {
                clearTimeout(timeout);
                pipe.unpipe(res);
                pipe.destroy();
                res.statusCode = 404;
                res.end('404 Not Found');
            }
        })

        proxy.listen(3061);

        await new Promise(r => setTimeout(r,30 * 1000));
        return true;
    }

    public finally(): Promise<void> {
        return Promise.resolve();
    }
    
}