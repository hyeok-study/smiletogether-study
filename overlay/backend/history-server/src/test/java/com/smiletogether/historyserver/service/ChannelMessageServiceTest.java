package com.smiletogether.historyserver.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.smiletogether.historyserver.domain.document.ChannelMessageDocument;
import com.smiletogether.historyserver.infrastructure.ExternalProfileApiClient;
import com.smiletogether.historyserver.repository.ChannelMessageRepository;
import com.smiletogether.historyserver.repository.ReactionRepository;
import com.smiletogether.historyserver.service.dto.ChannelMessages;
import com.smiletogether.historyserver.service.dto.request.ChannelMessagesRequest;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

@ExtendWith(MockitoExtension.class)
class ChannelMessageServiceTest {

    @Mock
    private ChannelMessageRepository channelMessageRepository;

    @Mock
    private ReactionRepository reactionRepository;

    @Mock
    private ExternalProfileApiClient externalProfileApiClient;

    @InjectMocks
    private ChannelMessageService channelMessageService;

    @Test
    void getChannelMessagesLoadsProfileOnceForRepeatedSenderEvenWhenProfileCallFails() {
        String workspaceId = "workspace-1";
        String channelId = "channel-1";
        String senderId = "sender-1";
        String token = "Bearer synthetic";
        LocalDateTime timestamp = LocalDateTime.of(2026, 1, 1, 0, 0);
        List<ChannelMessageDocument> messages = List.of(
                message("message-1", senderId, workspaceId, channelId, timestamp.minusSeconds(2)),
                message("message-2", senderId, workspaceId, channelId, timestamp.minusSeconds(1))
        );
        when(channelMessageRepository.findByWorkspaceIdAndChannelIdAndIsDeletedAndCreatedAtBefore(
                eq(workspaceId), eq(channelId), eq(false), eq(timestamp), any(Pageable.class)
        )).thenReturn(messages);
        when(externalProfileApiClient.getWorkspaceProfile(token, workspaceId, senderId)).thenReturn(null);

        ChannelMessages result = channelMessageService.getChannelMessages(
                new ChannelMessagesRequest(timestamp), workspaceId, channelId, token
        );

        verify(externalProfileApiClient).getWorkspaceProfile(token, workspaceId, senderId);
        assertThat(result.groupedMessages().values())
                .flatExtracting(value -> value)
                .hasSize(2);
    }

    @Test
    void successfulProfilesAreLoadedOncePerSenderAndNotSharedAcrossRequests() {
        var time = LocalDateTime.of(2026, 11, 12, 0, 0);
        var messages = List.of(message("m1", "s1", "w", "c", time),
                message("m2", "s1", "w", "c", time), message("m3", "s2", "w", "c", time));
        when(channelMessageRepository.findByWorkspaceIdAndChannelIdAndIsDeletedAndCreatedAtBefore(
                eq("w"), eq("c"), eq(false), eq(time), any(Pageable.class))).thenReturn(messages);
        var profile = new com.smiletogether.historyserver.service.dto.WorkspaceProfileDto("s1", "Fixture", "", "", true, "");
        when(externalProfileApiClient.getWorkspaceProfile("token", "w", "s1")).thenReturn(profile);
        when(externalProfileApiClient.getWorkspaceProfile("token", "w", "s2")).thenReturn(profile);
        for (int i = 0; i < 2; i++) {
            var result = channelMessageService.getChannelMessages(new ChannelMessagesRequest(time), "w", "c", "token");
            assertThat(result.groupedMessages().values()).flatExtracting(value -> value).hasSize(3);
        }
        verify(externalProfileApiClient, org.mockito.Mockito.times(2)).getWorkspaceProfile("token", "w", "s1");
        verify(externalProfileApiClient, org.mockito.Mockito.times(2)).getWorkspaceProfile("token", "w", "s2");
    }

    private ChannelMessageDocument message(
            String id,
            String senderId,
            String workspaceId,
            String channelId,
            LocalDateTime createdAt
    ) {
        return ChannelMessageDocument.builder()
                .id(id)
                .senderId(senderId)
                .workspaceId(workspaceId)
                .channelId(channelId)
                .content("message")
                .createdAt(createdAt)
                .build();
    }
}
