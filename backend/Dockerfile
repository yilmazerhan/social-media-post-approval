# syntax=docker/dockerfile:1

# ---------- build ----------
# The build needs the Shibboleth repository for OpenSAML (see pom.xml). In CI point Maven at the
# corporate Nexus mirror with a settings.xml rather than reaching the public internet.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Dependencies first: this layer is cached until the pom actually changes.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q clean package -DskipTests

# ---------- runtime ----------
FROM eclipse-temurin:21-jre-alpine AS runtime

RUN addgroup -S ksa && adduser -S -G ksa ksa
WORKDIR /app

COPY --from=build /build/target/*.jar app.jar
RUN chown -R ksa:ksa /app

USER ksa
EXPOSE 8080 8081

# Container-aware heap sizing; the rest of the JVM tuning belongs in the deployment, not the image.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD wget -q -O /dev/null http://localhost:8081/actuator/health/liveness || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
