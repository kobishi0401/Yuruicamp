# =============================================================================
# Yuruicamp backend — multi-stage image for local verify + Cloud Run
#
# Build (from backend/):
#   docker build -t yuruicamp-backend .
#
# Run against host Docker Postgres (Windows/Mac Docker Desktop):
#   docker run --rm -p 8080:8080 `
#     -e DB_URL=jdbc:postgresql://host.docker.internal:5433/yuruicamp `
#     -e DB_PASSWORD=your_password `
#     -e FIREBASE_ENABLED=false `
#     yuruicamp-backend
#
# Expectation: empty/migrated DB — Flyway runs V1 on startup; seed is separate.
# =============================================================================

# ----- stage 1: compile with JDK 25 -----
FROM eclipse-temurin:25-jdk AS build

WORKDIR /workspace

COPY mvnw mvnw
COPY .mvn .mvn
COPY pom.xml pom.xml
COPY src src

RUN chmod +x mvnw \
  && ./mvnw -q -DskipTests package \
  && mv target/backend-*.jar /workspace/app.jar

# ----- stage 2: slim runtime (JRE only; no Maven / no source) -----
FROM eclipse-temurin:25-jre AS runtime

WORKDIR /app

RUN groupadd --system spring \
  && useradd --system --gid spring --uid 10001 spring

COPY --from=build /workspace/app.jar /app/app.jar

USER spring:spring

EXPOSE 8080

# Cloud Run sets PORT; keep Spring on 8080 unless overridden.
ENV SERVER_PORT=8080 \
    SPRING_DEVTOOLS_RESTART_ENABLED=false

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
