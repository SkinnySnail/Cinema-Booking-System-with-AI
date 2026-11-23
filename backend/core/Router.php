<?php
/**
 * Router - Handle HTTP Routing
 */
class Router
{
    private $routes = [];
    private $middlewares = [];

    public function get($path, $handler)
    {
        $this->addRoute('GET', $path, $handler);
    }

    public function post($path, $handler)
    {
        $this->addRoute('POST', $path, $handler);
    }

    public function put($path, $handler)
    {
        $this->addRoute('PUT', $path, $handler);
    }

    public function delete($path, $handler)
    {
        $this->addRoute('DELETE', $path, $handler);
    }

    public function patch($path, $handler)
    {
        $this->addRoute('PATCH', $path, $handler);
    }

    private function addRoute($method, $path, $handler)
    {
        // Convert :param to regex pattern
        $pattern = preg_replace('/:\w+/', '([^/]+)', $path);
        $pattern = '#^' . $pattern . '$#';

        $this->routes[] = [
            'method' => $method,
            'path' => $path,
            'pattern' => $pattern,
            'handler' => $handler
        ];
    }

    public function addMiddleware($middleware)
    {
        $this->middlewares[] = $middleware;
    }

    public function run()
    {
        $method = $_SERVER['REQUEST_METHOD'];
        $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

        // Remove base path prefix
        $basePrefixes = ['/Cinema-Booking-System/backend', '/backend'];
        foreach ($basePrefixes as $prefix) {
            if (strpos($uri, $prefix) === 0) {
                $uri = substr($uri, strlen($prefix));
                break;
            }
        }

        // Remove /index.php prefix if it exists (from URL rewriting)
        if (strpos($uri, '/index.php') === 0) {
            $uri = substr($uri, strlen('/index.php'));
        }

        // Remove trailing slash
        $uri = rtrim($uri, '/') ?: '/';

        // Run middlewares
        foreach ($this->middlewares as $middleware) {
            if (is_callable($middleware)) {
                $middleware();
            }
        }

        // Find matching route
        foreach ($this->routes as $route) {
            if ($route['method'] === $method && preg_match($route['pattern'], $uri, $matches)) {
                array_shift($matches); // Remove full match

                $handler = $route['handler'];

                // Extract parameters from path
                $params = $this->extractParams($route['path'], $uri);

                // Handle closure
                if (is_callable($handler)) {
                    return call_user_func_array($handler, $matches);
                }

                // Handle Controller@method format
                if (is_string($handler) && strpos($handler, '@') !== false) {
                    list($controller, $handlerMethod) = explode('@', $handler);

                    if (class_exists($controller)) {
                        $controllerInstance = new $controller();

                        if (method_exists($controllerInstance, $handlerMethod)) {
                            return call_user_func_array(
                                [$controllerInstance, $handlerMethod],
                                array_values($params)
                            );
                        }
                    }
                }

                Response::error('Handler not found', 500);
                return;
            }
        }

        // No route found. Routing details are only returned when APP_DEBUG=true,
        // so production responses do not reveal request internals.
        http_response_code(404);
        $body = ['success' => false, 'message' => 'Route not found'];
        if (filter_var(getenv('APP_DEBUG'), FILTER_VALIDATE_BOOLEAN)) {
            $body['debug'] = [
                'parsed_uri' => $uri,
                'method' => $method,
                'registered_routes_count' => count($this->routes),
            ];
        }
        echo json_encode($body);
        return;
    }

    private function extractParams($pattern, $uri)
    {
        $patternParts = explode('/', trim($pattern, '/'));
        $uriParts = explode('/', trim($uri, '/'));

        $params = [];

        foreach ($patternParts as $index => $part) {
            if (strpos($part, ':') === 0) {
                $paramName = substr($part, 1);
                $params[$paramName] = $uriParts[$index] ?? null;
            }
        }

        return $params;
    }
}
