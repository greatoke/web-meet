#!/bin/bash

# Create certificates directory if it doesn't exist
mkdir -p certificates

# Generate private key and certificate
openssl req -x509 -newkey rsa:2048 -keyout certificates/key.pem -out certificates/cert.pem -days 365 -nodes -subj "/CN=localhost"

# Set proper permissions
chmod 600 certificates/key.pem
chmod 600 certificates/cert.pem

echo "SSL certificates generated successfully!"
echo "Key: certificates/key.pem"
echo "Certificate: certificates/cert.pem" 