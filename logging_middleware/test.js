class Logger {
    constructor(stack = 'default') {
        this.stack = stack;
        this.logs = [];
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
            await fetch('http://4.224.186.213/evaluation-service/logs', {
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
