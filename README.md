# Simple Status Page

A sleek HTML/PHP status page with RSS feed support, fully configurable via JSON.

## Default Login

**Username:** `admin`  
**Password:** `changeme`  

> You can change these credentials in `include/configuration.json` or via the JSON editor in the UI.

## Usage

### Option 1: Build from source

1. Clone or download the repository.  
2. Make sure Docker is installed.  
3. Build the Docker image:  
    ```bash
    docker build -t simple-status-page .
    ```
4. Run the container:
    ```bash
    docker run -d -p 8080:80 simple-status-page
    ```
    Your status page will be accessible at [http://localhost:8080](http://localhost:8080).

### Option 2: Use the ready-made image

Pull and run the pre-built image from Docker Hub:

```bash
docker run -d -p 8080:80 brandonsanders/simple-status-page:latest
```

This will start the status page immediately. You can mount your own JSON config to customize it.
