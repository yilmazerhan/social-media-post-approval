package com.kron.socialapproval.content.internal.application;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.kron.socialapproval.content.api.AttachmentDto;
import com.kron.socialapproval.content.api.ChannelDto;
import com.kron.socialapproval.content.api.PostDetailDto;
import com.kron.socialapproval.content.api.PostSummaryDto;
import com.kron.socialapproval.content.api.PostVersionDto;
import com.kron.socialapproval.content.internal.domain.Attachment;
import com.kron.socialapproval.content.internal.domain.Channel;
import com.kron.socialapproval.content.internal.domain.Post;
import com.kron.socialapproval.content.internal.domain.PostVersion;
import com.kron.socialapproval.identity.api.UserSummary;
import java.util.List;
import org.springframework.stereotype.Component;

/** Entities never leave the module; these are the shapes that do. */
@Component
public class PostMapper {

    private static final int EXCERPT_LENGTH = 220;

    private final ObjectMapper objectMapper;

    public PostMapper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public ChannelDto toDto(Channel channel) {
        if (channel == null) {
            return null;
        }
        JsonNode constraints = readConstraints(channel.getConstraints());
        return new ChannelDto(
                channel.getId(),
                channel.getCode(),
                channel.getName(),
                channel.getDescription(),
                constraints.hasNonNull("maxCharacters") ? constraints.get("maxCharacters").asInt() : null,
                constraints.hasNonNull("recommendedCharacters")
                        ? constraints.get("recommendedCharacters").asInt() : null,
                !constraints.has("allowsImage") || constraints.get("allowsImage").asBoolean(),
                !constraints.has("allowsVideo") || constraints.get("allowsVideo").asBoolean());
    }

    public AttachmentDto toDto(Attachment attachment) {
        return new AttachmentDto(
                attachment.getId(),
                attachment.getKind().name(),
                attachment.getOriginalFilename(),
                attachment.getContentTypeDetected() != null
                        ? attachment.getContentTypeDetected() : attachment.getContentTypeDeclared(),
                attachment.getSizeBytes(),
                attachment.getStatus().name(),
                attachment.getScanResult(),
                attachment.getWidth(),
                attachment.getHeight(),
                attachment.getDurationSeconds(),
                attachment.getAltText(),
                attachment.getCaption(),
                attachment.getSortOrder(),
                "/api/v1/attachments/" + attachment.getId() + "/content",
                attachment.getCreatedAt());
    }

    public PostDetailDto toDetail(Post post, Channel channel, UserSummary author, List<Attachment> attachments) {
        return new PostDetailDto(
                post.getId(),
                post.getTitle(),
                post.getBodyHtml(),
                post.getBodyText(),
                post.getStatus().name(),
                post.getPriority().name(),
                toDto(channel),
                author,
                post.getCurrentVersionNo(),
                attachments.stream().map(this::toDto).toList(),
                post.getSlaState().name(),
                post.getDueAt(),
                post.getSubmittedAt(),
                post.getDecidedAt(),
                post.getCreatedAt(),
                post.getUpdatedAt(),
                post.getOptimisticVersion(),
                post.getStatus().isEditable(),
                post.getStatus().isSubmittable());
    }

    public PostSummaryDto toSummary(Post post, Channel channel, UserSummary author, int attachmentCount,
                                    String aiRiskLevel, UserSummary awaitingDecisionFrom) {
        return new PostSummaryDto(
                post.getId(),
                post.getTitle(),
                excerpt(post.getBodyText()),
                post.getStatus().name(),
                post.getPriority().name(),
                toDto(channel),
                author,
                post.getCurrentVersionNo(),
                attachmentCount,
                post.getSlaState().name(),
                post.getDueAt(),
                post.getSubmittedAt(),
                post.getUpdatedAt(),
                aiRiskLevel,
                awaitingDecisionFrom);
    }

    public PostVersionDto toDto(PostVersion version, UserSummary author, List<Attachment> attachments) {
        return new PostVersionDto(
                version.getId(),
                version.getVersionNo(),
                version.getTitle(),
                version.getBodyHtml(),
                version.getBodyText(),
                version.getReason().name(),
                author,
                version.getCreatedAt(),
                attachments.stream().map(this::toDto).toList());
    }

    private static String excerpt(String text) {
        if (text == null || text.isBlank()) {
            return "";
        }
        String flattened = text.replaceAll("\\s+", " ").trim();
        return flattened.length() <= EXCERPT_LENGTH
                ? flattened
                : flattened.substring(0, EXCERPT_LENGTH).trim() + "…";
    }

    private JsonNode readConstraints(String json) {
        try {
            return objectMapper.readTree(json == null || json.isBlank() ? "{}" : json);
        } catch (Exception e) {
            return objectMapper.createObjectNode();
        }
    }
}
