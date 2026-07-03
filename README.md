# Porphyrion <img width="42" height="42" alt="hat" src="resources/hat.png" /> <sub>v0.6</sub>

An API client — send HTTP requests, load testing, read the responses.

Builds in 5~15s · ~ 5 MB RAM · 0.732 MB image.
<img width="1470" height="879" alt="image" src="https://github.com/user-attachments/assets/dafd0330-d099-4a43-bfa9-581ccc086f26" />


## Run

```bash
./deploy.sh
```

Opens at http://localhost:8099

## Data

All saved requests are stored in `./data/requests.json` on the host machine. This directory is bind-mounted into the container at `/data`, so requests survive image rebuilds and container restarts.

Because the file is on the host, it can be committed to version control. Avoid committing Bearer Tokens or credentials; use `.gitignore` accordingly.
