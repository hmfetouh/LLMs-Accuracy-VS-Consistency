"use client";

import { useState } from "react";
import {
  Box,
  Container,
  VStack,
  Heading,
  Input,
  Select,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Textarea,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useToast,
  FormControl,
  FormLabel,
  Alert,
  AlertIcon,
  Text,
  HStack,
  Tag,
  IconButton,
  Flex,
  useColorModeValue,
} from "@chakra-ui/react";
import { verifyOpenAIKey, verifyDeepSeekKey, verifyOpenWebUIKey } from "./api";

interface Model {
  id: string;
  name: string;
  provider: "openai" | "deepseek" | "openwebui";
}

interface EvaluationResult {
  questionId: string;
  modelResults: Record<string, boolean>;
}

export default function Home() {
  const [openaiKey, setOpenaiKey] = useState("");
  const [deepseekKey, setDeepseekKey] = useState("");
  const [openwebuiKey, setOpenwebuiKey] = useState("");
  const [selectedModels, setSelectedModels] = useState<Model[]>([]);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [temperature, setTemperature] = useState(0.7);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      // Process CSV file here
      toast({
        title: "File uploaded successfully",
        status: "success",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Error uploading file",
        description: "Please make sure the file is in the correct format",
        status: "error",
        duration: 3000,
      });
    }
  };

  const verifyApiKey = async (provider: string, key: string) => {
    if (!key) {
      toast({
        title: "Please enter an API key",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    setIsLoading(true);
    try {
      let models: Model[] = [];
      
      switch (provider) {
        case "openai":
          models = await verifyOpenAIKey(key);
          break;
        case "deepseek":
          models = await verifyDeepSeekKey(key);
          break;
        case "openwebui":
          models = await verifyOpenWebUIKey(key);
          break;
      }

      setAvailableModels(prev => {
        const filteredPrev = prev.filter(m => m.provider !== provider);
        return [...filteredPrev, ...models];
      });

      toast({
        title: `${provider} API key verified`,
        description: `${models.length} models available`,
        status: "success",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: `Invalid ${provider} API key`,
        description: error instanceof Error ? error.message : "Verification failed",
        status: "error",
        duration: 3000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const startEvaluation = async () => {
    if (selectedModels.length === 0) {
      toast({
        title: "Please select at least one model",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    setIsLoading(true);
    try {
      // Implement evaluation logic here
      setResults([]);
    } catch (error) {
      toast({
        title: "Error during evaluation",
        description: "Please check your inputs and try again",
        status: "error",
        duration: 3000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const bgColor = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  return (
    <Container maxW="container.xl" py={4}>
      <VStack spacing={4} align="stretch">
        <Heading size="md" mb={2}>LLMs Accuracy vs Consistency on MCQ</Heading>

        <Box p={4} borderWidth={1} borderRadius="md" bg={bgColor} borderColor={borderColor}>
          <Text fontSize="sm" fontWeight="bold" mb={3}>API Configuration</Text>
          <VStack spacing={3}>
            <FormControl>
              <FormLabel fontSize="xs">OpenAI API Key</FormLabel>
              <HStack>
                <Input
                  size="sm"
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="Enter OpenAI API key"
                />
                <Button
                  size="sm"
                  onClick={() => verifyApiKey("openai", openaiKey)}
                  isLoading={isLoading}
                  colorScheme="blue"
                >
                  Verify
                </Button>
              </HStack>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="xs">DeepSeek API Key</FormLabel>
              <HStack>
                <Input
                  size="sm"
                  type="password"
                  value={deepseekKey}
                  onChange={(e) => setDeepseekKey(e.target.value)}
                  placeholder="Enter DeepSeek API key"
                />
                <Button
                  size="sm"
                  onClick={() => verifyApiKey("deepseek", deepseekKey)}
                  isLoading={isLoading}
                  colorScheme="blue"
                >
                  Verify
                </Button>
              </HStack>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="xs">Open WebUI API Key</FormLabel>
              <HStack>
                <Input
                  size="sm"
                  type="password"
                  value={openwebuiKey}
                  onChange={(e) => setOpenwebuiKey(e.target.value)}
                  placeholder="Enter Open WebUI API key"
                />
                <Button
                  size="sm"
                  onClick={() => verifyApiKey("openwebui", openwebuiKey)}
                  isLoading={isLoading}
                  colorScheme="blue"
                >
                  Verify
                </Button>
              </HStack>
            </FormControl>
          </VStack>
        </Box>

        <Box p={4} borderWidth={1} borderRadius="md" bg={bgColor} borderColor={borderColor}>
          <Text fontSize="sm" fontWeight="bold" mb={3}>Model Selection</Text>
          <VStack spacing={3}>
            <Select
              size="sm"
              placeholder="Select models"
              onChange={(e) => {
                const model = availableModels.find(m => m.id === e.target.value);
                if (model && !selectedModels.find(m => m.id === model.id)) {
                  setSelectedModels(prev => [...prev, model]);
                }
              }}
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.provider})
                </option>
              ))}
            </Select>
            <Flex wrap="wrap" gap={2}>
              {selectedModels.map((model) => (
                <Tag
                  key={model.id}
                  size="sm"
                  borderRadius="full"
                  variant="subtle"
                  colorScheme="blue"
                >
                  <Text fontSize="xs">{model.name}</Text>
                  <Button
                    size="xs"
                    ml={1}
                    variant="ghost"
                    colorScheme="blue"
                    onClick={() => setSelectedModels(prev => prev.filter(m => m.id !== model.id))}
                  >
                    ×
                  </Button>
                </Tag>
              ))}
            </Flex>
          </VStack>
        </Box>

        <Box p={4} borderWidth={1} borderRadius="md" bg={bgColor} borderColor={borderColor}>
          <Text fontSize="sm" fontWeight="bold" mb={3}>Questions Database</Text>
          <Input
            size="sm"
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
          />
        </Box>

        <Box p={4} borderWidth={1} borderRadius="md" bg={bgColor} borderColor={borderColor}>
          <Text fontSize="sm" fontWeight="bold" mb={3}>Evaluation Settings</Text>
          <VStack spacing={3}>
            <FormControl>
              <FormLabel fontSize="xs">Temperature</FormLabel>
              <NumberInput
                size="sm"
                value={temperature}
                onChange={(_, value) => setTemperature(value)}
                min={0}
                max={2}
                step={0.1}
                precision={2}
              >
                <NumberInputField />
                <NumberInputStepper>
                  <NumberIncrementStepper />
                  <NumberDecrementStepper />
                </NumberInputStepper>
              </NumberInput>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="xs">System Prompt</FormLabel>
              <Textarea
                size="sm"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Enter system prompt"
                rows={3}
              />
            </FormControl>

            <Button
              size="sm"
              colorScheme="blue"
              onClick={startEvaluation}
              isLoading={isLoading}
              width="full"
            >
              Start Evaluation
            </Button>
          </VStack>
        </Box>

        {results.length > 0 && (
          <Box p={4} borderWidth={1} borderRadius="md" bg={bgColor} borderColor={borderColor}>
            <Text fontSize="sm" fontWeight="bold" mb={3}>Results</Text>
            <Table variant="simple" size="sm">
              <Thead>
                <Tr>
                  <Th>ID</Th>
                  {selectedModels.map((model) => (
                    <Th key={model.id}>{model.name}</Th>
                  ))}
                </Tr>
              </Thead>
              <Tbody>
                {results.map((result) => (
                  <Tr key={result.questionId}>
                    <Td>{result.questionId}</Td>
                    {selectedModels.map((model) => (
                      <Td key={model.id}>
                        {result.modelResults[model.id] ? "✓" : "✗"}
                      </Td>
                    ))}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}
      </VStack>
    </Container>
  );
}
