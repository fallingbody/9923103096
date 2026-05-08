class Logger {
    constructor(stack = 'default') {
        this.stack = stack;
        this.logs = [];
        this.evaluationServiceURL = (
            process.env.EVALUATION_SERVICE_URL ||
            'http://4.224.186.213/evaluation-service'
        ).replace(/\/+$/, '');
    }
    
    log(level, packageName, message, metadata = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            stack: this.stack,
            package: packageName,
            message,
            metadata
        };
        
        console.log(
            `[${timestamp}] [${level.toUpperCase()}] [${this.stack}] [${packageName}] ${message}`,
            metadata
        );
        
        this.logs.push(logEntry);
        
        if (['error', 'fatal'].includes(level.toLowerCase())) {
            this.sendToServer(logEntry);
        }
        
        return logEntry;
    }
    
    debug(pkg, msg, meta) { 
        return this.log('debug', pkg, msg, meta); 
    }
    
    info(pkg, msg, meta) { 
        return this.log('info', pkg, msg, meta); 
    }
    
    warn(pkg, msg, meta) { 
        return this.log('warn', pkg, msg, meta); 
    }
    
    error(pkg, msg, meta) { 
        return this.log('error', pkg, msg, meta); 
    }
    
    fatal(pkg, msg, meta) { 
        return this.log('fatal', pkg, msg, meta); 
    }
    async sendToServer(logEntry) {
        try {
            await fetch(`${this.evaluationServiceURL}/logs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.LOG_TOKEN}`
                },
                body: JSON.stringify(logEntry)
            });
        } catch (error) {
            console.error('Log send failed:', error.message);
        }
    }
    
    getLogs() {
        return this.logs;
    }
    
    clearLogs() {
        this.logs = [];
    }
}

function loggingMiddleware(stack = 'api-server') {
    const logger = new Logger(stack);
    
    return (req, res, next) => {
        const start = Date.now();
        
        logger.info('http', `${req.method} ${req.path}`, { ip: req.ip });
        
        const originalSend = res.send;
        res.send = function(data) {
            const duration = Date.now() - start;
            
            logger.log(
                res.statusCode >= 400 ? 'error' : 'info',
                'http',
                `${req.method} ${req.path} ${res.statusCode}`,
                { statusCode: res.statusCode, duration: `${duration}ms` }
            );
            
            return originalSend.call(this, data);
        };
        
        next();
    };
}

const logger = new Logger('Backend');
logger.error('handler', 'received string, expected bool');
logger.fatal('db', 'Critical database connection failure');

module.exports = { Logger, loggingMiddleware };
