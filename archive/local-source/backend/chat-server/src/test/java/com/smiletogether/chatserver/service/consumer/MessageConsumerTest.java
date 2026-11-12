package com.smiletogether.chatserver.service.consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.smiletogether.chatserver.dto.ChannelMessageDto;
import com.smiletogether.chatserver.dto.WorkspaceProfileDto;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

@ExtendWith(MockitoExtension.class)
class MessageConsumerTest {

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    private ObjectMapper objectMapper;
    private MessageConsumer messageConsumer;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        messageConsumer = new MessageConsumer(messagingTemplate, objectMapper);
    }

    @Test
    void consumeSendMessageForwardsItToWorkspaceChannelSubscription() throws Exception {
        ChannelMessageDto dto = new ChannelMessageDto(
                "SEND",
                "message-1",
                "workspace-1",
                "channel-1",
                new WorkspaceProfileDto("user-1", "Tester", "profile.png", "QA", true, "testing"),
                "[run-1][vu-1][seq-1][sentAt-1000] hello",
                "Bearer token",
                LocalDateTime.of(2025, 1, 1, 0, 0),
                LocalDateTime.of(2025, 1, 1, 0, 0),
                false
        );

        messageConsumer.consume(objectMapper.writeValueAsString(dto));

        ArgumentCaptor<Object> payloadCaptor = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(
                eq("/sub/workspaces/workspace-1/channels/channel-1"), payloadCaptor.capture()
        );
        assertThat(payloadCaptor.getValue().toString()).contains("message-1", "run-1");
    }

    @Test
    void consumeUnknownTypeDoesNotPublishToWebSocket() {
        messageConsumer.consume("{\"type\":\"UNKNOWN\"}");

        verify(messagingTemplate, never()).convertAndSend(any(String.class), any(Object.class));
    }

    @Test
    void consumeMalformedPayloadDoesNotPublishToWebSocket() {
        messageConsumer.consume("not-json");

        verify(messagingTemplate, never()).convertAndSend(any(String.class), any(Object.class));
    }
}
